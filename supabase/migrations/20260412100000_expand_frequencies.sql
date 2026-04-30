-- Expand subscription_frequency enum with more intervals and teach
-- generate_subscription_invoices() how to advance next_billing_date
-- for each of them.
--
-- New values cover typical SaaS / hosting / agency billing cases that
-- the original 3-value enum didn't:
--   weekly    / biweekly  / bimonthly
--   semiannual / biannual (every 2 years, typical for .pt domains)
--
-- Why one big migration: enum additions in Postgres require ALTER TYPE
-- which cannot run inside a transaction block, and re-creating the
-- generate_subscription_invoices() function needs the new values to
-- already exist in the enum. Splitting forces fragile ordering; keeping
-- them together makes the migration self-contained.

alter type subscription_frequency add value if not exists 'weekly' before 'monthly';
alter type subscription_frequency add value if not exists 'biweekly' before 'monthly';
alter type subscription_frequency add value if not exists 'bimonthly' after 'monthly';
alter type subscription_frequency add value if not exists 'semiannual' after 'quarterly';
alter type subscription_frequency add value if not exists 'biannual' after 'yearly';

-- Re-create generate_subscription_invoices() with cases for every
-- frequency value. Behavior preserved for existing monthly/quarterly/
-- yearly subs; new frequencies advance next_billing_date by the matching
-- interval.
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
  has_any_items boolean;
begin
  for sub in
    select * from public.subscriptions
    where status = 'active'
      and next_billing_date <= today
    order by next_billing_date
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

    -- Pro-rata factor: only on the very first invoice if requested.
    -- For intervals we don't specifically model, fall back to a linear
    -- estimate based on frequency_days mapping below.
    prorate_factor := 1.0;
    if is_first_invoice and sub.prorate_first_invoice then
      prorate_factor := case sub.frequency
        when 'weekly'     then greatest(0.05, 1.0 - (extract(dow from sub.start_date)::numeric / 7))
        when 'biweekly'   then greatest(0.05, 1.0 - ((extract(dow from sub.start_date)::numeric) / 14))
        when 'monthly'    then (
            select greatest(0.05, (greatest(1, dip - extract(day from sub.start_date)::int + 1))::numeric / dip::numeric)
            from (select extract(day from (date_trunc('month', sub.start_date) + interval '1 month' - interval '1 day'))::int as dip) d
          )
        when 'bimonthly'  then greatest(0.05, 1.0 - (extract(day from sub.start_date)::numeric / 60))
        when 'quarterly'  then greatest(0.05, 1.0 - (extract(day from sub.start_date)::numeric / 90))
        when 'semiannual' then greatest(0.05, 1.0 - (extract(doy from sub.start_date)::numeric / 180))
        when 'yearly'     then greatest(0.05, 1.0 - (extract(doy from sub.start_date)::numeric / 365))
        when 'biannual'   then greatest(0.05, 1.0 - (extract(doy from sub.start_date)::numeric / 730))
      end;
    end if;

    -- Recurring + addon lines from the subscription_items breakdown.
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

    -- Fallback: if the subscription has no items (legacy data), bill the
    -- whole subscription.amount as a single line.
    if not has_any_items then
      line_amount := round((coalesce(sub.amount, 0) * prorate_factor)::numeric, 2);
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, category_id, position)
      values (
        new_invoice_id,
        sub.name || ' — ' || period_label ||
          case when prorate_factor < 0.999 then ' (pro-rata)' else '' end,
        1,
        line_amount,
        sub.category_id,
        0
      );
    end if;

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
