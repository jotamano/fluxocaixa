-- SQL port of the Edge Function generate-subscription-invoices/index.ts.
-- Runs entirely inside Postgres (no Deno) so it works in offline self-host
-- deployments where Edge Functions are not available.
--
-- Behavior:
--   * Picks every active subscription whose next_billing_date <= today.
--   * For each, allocates the next FT YYYY/NNN invoice number for that year
--     using a row lock to avoid duplicates under concurrent runs.
--   * Builds an invoice with one line per recurring/addon subscription_item
--     plus, on the very first invoice for the subscription, any not-yet-
--     invoiced setup lines (and pro-rata adjustment if enabled).
--   * Advances the subscription's next_billing_date by its frequency.
--   * Stamps first_invoice_generated_at on the first run so subsequent runs
--     stop charging setup fees and stop applying pro-rata.
--
-- Scheduling: pg_cron job runs daily at 03:30 (after the reactivation job).

create or replace function public.generate_subscription_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  item record;
  today date := current_date;
  next_num integer;
  invoice_number text;
  due_date date;
  new_invoice_id uuid;
  is_first_invoice boolean;
  prorate_factor numeric;
  days_in_period integer;
  days_remaining integer;
  line_amount numeric;
  generated_count integer := 0;
  pt_months text[] := array[
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  period_label text;
begin
  for sub in
    select *
    from public.subscriptions
    where status = 'active'
      and next_billing_date <= today
    order by next_billing_date
    for update skip locked
  loop
    is_first_invoice := sub.first_invoice_generated_at is null;

    -- Allocate next invoice number for the year.
    select coalesce(max(
      (regexp_match(number, '/(\d+)$'))[1]::int
    ), 0) + 1
    into next_num
    from public.invoices
    where number like 'FT ' || extract(year from today)::text || '/%';

    invoice_number := 'FT ' || extract(year from today)::text || '/' || lpad(next_num::text, 3, '0');
    due_date := today + interval '30 days';
    period_label := pt_months[extract(month from sub.next_billing_date)::int] || ' ' || extract(year from sub.next_billing_date)::text;

    insert into public.invoices (number, client_id, subscription_id, status, issue_date, due_date, notes)
    values (invoice_number, sub.client_id, sub.id, 'pending', today, due_date,
            'Fatura gerada automaticamente da subscrição: ' || sub.name)
    returning id into new_invoice_id;

    -- Pro-rata factor: only on the very first invoice if requested.
    prorate_factor := 1.0;
    if is_first_invoice and sub.prorate_first_invoice then
      if sub.frequency = 'monthly' then
        days_in_period := extract(day from (date_trunc('month', sub.start_date) + interval '1 month' - interval '1 day'));
        days_remaining := greatest(1, days_in_period - extract(day from sub.start_date)::int + 1);
        prorate_factor := days_remaining::numeric / days_in_period::numeric;
      elsif sub.frequency = 'quarterly' then
        prorate_factor := greatest(0.05, 1.0 - (extract(day from sub.start_date)::numeric / 90));
      elsif sub.frequency = 'yearly' then
        prorate_factor := greatest(0.05, 1.0 - (extract(doy from sub.start_date)::numeric / 365));
      end if;
    end if;

    -- Recurring + addon lines: always included, scaled by pro-rata.
    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      line_amount := round((item.amount * prorate_factor)::numeric, 2);
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, category_id, position)
      values (
        new_invoice_id,
        item.description || ' — ' || period_label ||
          case when prorate_factor < 0.999 then ' (pro-rata)' else '' end,
        1,
        line_amount,
        coalesce(item.category_id, sub.category_id),
        item.position
      );
    end loop;

    -- Setup lines: only on first invoice, only if not yet invoiced.
    if is_first_invoice then
      for item in
        select * from public.subscription_items
        where subscription_id = sub.id
          and kind = 'setup'
          and invoiced_at is null
        order by position, created_at
      loop
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, category_id, position)
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          coalesce(item.category_id, sub.category_id),
          1000 + item.position
        );
        update public.subscription_items set invoiced_at = now() where id = item.id;
      end loop;
    end if;

    -- Advance next_billing_date.
    update public.subscriptions
    set next_billing_date = case sub.frequency
                              when 'monthly'   then sub.next_billing_date + interval '1 month'
                              when 'quarterly' then sub.next_billing_date + interval '3 months'
                              when 'yearly'    then sub.next_billing_date + interval '1 year'
                            end::date,
        first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
    where id = sub.id;

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
end;
$$;

-- Allow Studio / service_role to invoke manually; SECURITY DEFINER means it
-- runs as the function owner regardless of caller.
grant execute on function public.generate_subscription_invoices() to authenticated, service_role;

-- Schedule via pg_cron if available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('generate-subscription-invoices') from cron.job where jobname = 'generate-subscription-invoices';
    perform cron.schedule(
      'generate-subscription-invoices',
      '30 3 * * *',
      $cron$ select public.generate_subscription_invoices(); $cron$
    );
  end if;
end$$;
