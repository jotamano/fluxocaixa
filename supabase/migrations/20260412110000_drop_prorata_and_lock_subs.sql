-- Drop the pro-rata first-invoice feature and re-add row-level locking to
-- generate_subscription_invoices().
--
-- Why drop pro-rata:
--   * In practice nobody used it. Service-business subscriptions either
--     start at the beginning of a period or are billed in full anyway.
--   * The previous implementation had a bug for "biweekly" frequency
--     (Devin Review #18) — the divisor was off, capping the discount at
--     ~57% in the worst case. Removing the feature removes the class of
--     bugs entirely.
--
-- Why re-add FOR UPDATE SKIP LOCKED:
--   * The expand-frequencies migration (#18) accidentally dropped it
--     when re-creating the function. Without it, the daily pg_cron job
--     and a manual "Gerar agora" click can race and produce duplicate
--     invoices for the same period.
--   * SKIP LOCKED is the standard "claim a row, leave the others for
--     the next worker" pattern — exactly what we want here.
--
-- Why no category_id any more:
--   * The drop_service_categories migration removed those columns. The
--     previous re-create migrations forgot to remove them from the
--     INSERT lists, which would have failed at execution time. This
--     version matches the actual schema.

-- 1. Drop the column. CASCADE in case anything else still depended on it.
alter table public.subscriptions drop column if exists prorate_first_invoice;

-- 2. Re-create generate_subscription_invoices() without pro-rata, with
--    `for update skip locked`, and without category_id references.
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
  generated_count integer := 0;
  pt_months text[] := array[
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  period_label text;
  has_any_items boolean;
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

    select count(*) > 0 into has_any_items
    from public.subscription_items
    where subscription_id = sub.id
      and kind in ('recurring', 'addon');

    select coalesce(max(substring(number from 'FT \d+/(\d+)')::int), 0) + 1
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

    -- Recurring + addon lines from the subscription_items breakdown.
    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
      values (
        new_invoice_id,
        item.description || ' — ' || period_label,
        1,
        round(item.amount::numeric, 2),
        item.position
      );
    end loop;

    -- Fallback: if the subscription has no items (legacy data), bill the
    -- whole subscription.amount as a single line.
    if not has_any_items then
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
      values (
        new_invoice_id,
        sub.name || ' — ' || period_label,
        1,
        round(coalesce(sub.amount, 0)::numeric, 2),
        0
      );
    end if;

    -- Setup lines: only on first invoice, only if not yet invoiced.
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

    -- Advance next_billing_date using the frequency's natural interval.
    update public.subscriptions
    set next_billing_date = case sub.frequency
                              when 'weekly'     then sub.next_billing_date + interval '1 week'
                              when 'biweekly'   then sub.next_billing_date + interval '2 weeks'
                              when 'monthly'    then sub.next_billing_date + interval '1 month'
                              when 'bimonthly'  then sub.next_billing_date + interval '2 months'
                              when 'quarterly'  then sub.next_billing_date + interval '3 months'
                              when 'semiannual' then sub.next_billing_date + interval '6 months'
                              when 'yearly'     then sub.next_billing_date + interval '1 year'
                              when 'biannual'   then sub.next_billing_date + interval '2 years'
                            end::date,
        first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
    where id = sub.id;

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
end;
$$;

grant execute on function public.generate_subscription_invoices() to authenticated, service_role;
