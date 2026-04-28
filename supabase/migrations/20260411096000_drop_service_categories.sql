-- Categories were never useful in practice — services + descriptions cover
-- everything we need for grouping/filtering. Drop the standalone categories
-- catalog and the FKs in services / subscriptions / subscription_items /
-- invoice_items. The columns are dropped (not just nulled) so the schema is
-- consistent with the frontend, which no longer references them.

-- The pg_cron function generate_subscription_invoices() inserts category_id
-- into invoice_items, so we have to recreate it without those references
-- BEFORE we drop the columns, or the function body fails to plan.

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

    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      line_amount := round((item.amount * prorate_factor)::numeric, 2);
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
      values (
        new_invoice_id,
        item.description || ' — ' || period_label ||
          case when prorate_factor < 0.999 then ' (pro-rata)' else '' end,
        1,
        line_amount,
        item.position
      );
    end loop;

    if is_first_invoice then
      for item in
        select * from public.subscription_items
        where subscription_id = sub.id
          and kind = 'setup'
          and invoiced_at is null
        order by position, created_at
      loop
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          1000 + item.position
        );
        update public.subscription_items set invoiced_at = now() where id = item.id;
      end loop;
    end if;

    -- Advance next_billing_date by frequency.
    update public.subscriptions
    set next_billing_date = case
        when sub.frequency = 'monthly' then sub.next_billing_date + interval '1 month'
        when sub.frequency = 'quarterly' then sub.next_billing_date + interval '3 months'
        when sub.frequency = 'yearly' then sub.next_billing_date + interval '1 year'
        else sub.next_billing_date
      end,
      first_invoice_generated_at = coalesce(sub.first_invoice_generated_at, now())
    where id = sub.id;

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
end;
$$;

ALTER TABLE invoice_items DROP COLUMN IF EXISTS category_id;
ALTER TABLE subscription_items DROP COLUMN IF EXISTS category_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS category_id;
ALTER TABLE services DROP COLUMN IF EXISTS category_id;

DROP TABLE IF EXISTS service_categories;
