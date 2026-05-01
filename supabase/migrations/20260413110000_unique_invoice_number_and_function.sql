-- Unify invoice number allocation between the frontend and the SQL job.
--
-- Until now the frontend (useNextInvoiceNumber) and
-- generate_subscription_invoices() each had their own implementation of
-- "find the highest FT YYYY/NNN for the current year and add 1". They
-- can race when an operator clicks "Nova Fatura" while pg_cron is
-- running, producing two invoices with the same number.
--
-- This migration consolidates the logic in one SQL function, adds an
-- advisory lock for callers that compute + INSERT in a single
-- transaction, and adds a UNIQUE constraint as the final safety net so
-- any race that escapes the lock fails loudly instead of silently
-- duplicating an invoice number.

-- 1. Refuse to add the unique constraint if the data is currently
--    inconsistent. We'd rather block the migration than corrupt by
--    deleting "winning" rows automatically.
do $$
declare
  dup_count int;
begin
  select count(*) into dup_count from (
    select number
    from public.invoices
    group by number
    having count(*) > 1
  ) dups;

  if dup_count > 0 then
    raise exception
      'Cannot add unique constraint on invoices.number: % duplicate value(s) found. Resolve manually before re-running this migration.',
      dup_count;
  end if;
end
$$;

-- 2. Final guard: any race that escapes the advisory lock (e.g. two
--    callers in different transactions that both read the same max
--    before the first INSERT commits) fails on this constraint with
--    SQLSTATE 23505 instead of duplicating.
alter table public.invoices
  add constraint invoices_number_unique unique (number);

-- 3. Single source of truth for "next FT YYYY/NNN".
--
-- Callers that compute + INSERT in the same transaction get full
-- atomicity via pg_advisory_xact_lock. Callers that fetch the number
-- in one transaction and INSERT from another (e.g. RPC from the JS
-- client) rely on the unique constraint above + a small retry loop
-- on the client side.
create or replace function public.next_invoice_number(target_year int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_num int;
begin
  -- Two-key advisory lock: (function-name hash, year). Both args are
  -- 32-bit ints — the int/int overload is what we want here, NOT the
  -- single-bigint overload. Lock auto-releases at end of transaction.
  perform pg_advisory_xact_lock(
    hashtext('public.next_invoice_number'),
    target_year
  );

  select coalesce(max(substring(number from 'FT \d+/(\d+)')::int), 0) + 1
    into next_num
    from public.invoices
   where number like 'FT ' || target_year::text || '/%';

  return 'FT ' || target_year::text || '/' || lpad(next_num::text, 3, '0');
end;
$$;

revoke all on function public.next_invoice_number(int) from public, anon;
grant execute on function public.next_invoice_number(int) to authenticated, service_role;

-- 4. generate_subscription_invoices() now delegates the number
--    allocation to next_invoice_number(). Everything else is identical
--    to the previous version (FOR UPDATE SKIP LOCKED, fallback
--    single-line for legacy subs, setup items on first invoice, etc.).
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

    invoice_number := public.next_invoice_number(extract(year from today)::int);
    due_date := today + interval '30 days';
    period_label := pt_months[extract(month from sub.next_billing_date)::int]
                  || ' ' || extract(year from sub.next_billing_date)::text;

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

    -- Fallback: legacy subs with no subscription_items still bill the
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

revoke all on function public.generate_subscription_invoices() from public, anon;
grant execute on function public.generate_subscription_invoices() to authenticated, service_role;
