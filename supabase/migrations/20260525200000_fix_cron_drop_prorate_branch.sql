-- Hot-fix: re-create `generate_subscription_invoices()` without the
-- pro-rata branch AND without the category_id references.
--
-- Two regressions stacked on top of each other have left the
-- production cron broken since the IVA-fields migration:
--
--   1. `subscriptions.prorate_first_invoice` was DROPPED by migration
--      20260412110000_drop_prorata_and_lock_subs.sql when the pro-rata
--      feature was retired (see the rationale in that file).
--   2. `invoice_items.category_id`, `subscription_items.category_id`,
--      `subscriptions.category_id` were ALL dropped by migration
--      20260411096000_drop_service_categories.sql, which carefully
--      re-created `generate_subscription_invoices()` first to remove
--      the references.
--
-- But two later migrations regressed and re-introduced both
-- references inside the function body:
--
--   * 20260420100000_add_iva_fields.sql
--       line 82  → `if is_first_invoice and sub.prorate_first_invoice`
--       line 102 → `insert into public.invoice_items (... category_id ...)`
--       line 109 → `coalesce(item.category_id, sub.category_id)`
--       line 123 → `insert into public.invoice_items (... category_id ...)`
--       line 129 → `coalesce(item.category_id, sub.category_id)`
--   * 20260510082500_cron_invoice_service_dates.sql
--       line 110 → same pro-rata reference
--       lines 134, 143, 174, 182 → same category_id references
--
-- `CREATE OR REPLACE FUNCTION` does not validate plpgsql bodies at
-- creation time (record field accesses are bound lazily), so these
-- migrations were accepted by Postgres even though the columns no
-- longer existed. The breakage only surfaces at execution time.
--
-- Production effect: the daily pg_cron job that runs at 03:30 UTC
-- (`select public.generate_subscription_invoices();`) errors with
-- `record "sub" has no field "prorate_first_invoice"` on the first
-- iteration and no recurring invoices are generated. Active
-- subscriptions silently accumulate `next_billing_date` in the past.
--
-- Fix strategy: re-create the function with the exact behaviour of
-- 20260510082500_cron_invoice_service_dates.sql (service dates from
-- app_settings offset, `source_subscription_item_id` linking, setup
-- lines closing the inverse link, etc.) EXCEPT:
--   * The pro-rata branch and its supporting variable declarations
--     (`prorate_factor`, `days_in_period`, `days_remaining`) are
--     removed. Recurring + addon lines now bill the full
--     `item.amount` on every invoice, matching the behaviour since
--     20260412110000 onwards.
--   * Every `category_id` reference is removed from the INSERT
--     column lists and the VALUES clauses, matching the cleanup
--     done in 20260411096000_drop_service_categories.sql.

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
  line_amount numeric;
  generated_count integer := 0;
  pt_months text[] := array[
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  period_label text;
  -- Resolution of offset is best-effort: if the singleton row hasn't
  -- been seeded yet (e.g. fresh self-host before the 20260508140000
  -- migration ran) we fall back to the historical hardcoded +1 so
  -- the math stays consistent with what the client paths used to do.
  offset_days int;
  service_end date;
  service_start date;
  inserted_item_id uuid;
begin
  select coalesce((select billing_anchor_offset_days from public.app_settings where id = 1), 1)
  into offset_days;

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

    -- Service period covered by this invoice. The offset is applied
    -- so that operators using a non-default value (e.g. -1 for "bill
    -- one day early") still see the correct end-of-service date on
    -- the line.
    service_end := sub.next_billing_date - offset_days;
    if is_first_invoice then
      service_start := sub.start_date;
    else
      service_start := case sub.frequency
                         when 'monthly'   then service_end - interval '1 month' + interval '1 day'
                         when 'quarterly' then service_end - interval '3 months' + interval '1 day'
                         when 'yearly'    then service_end - interval '1 year' + interval '1 day'
                       end::date;
    end if;

    insert into public.invoices (number, client_id, subscription_id, status, issue_date, due_date, notes)
    values (invoice_number, sub.client_id, sub.id, 'pending', today, due_date,
            'Fatura gerada automaticamente da subscrição: ' || sub.name)
    returning id into new_invoice_id;

    -- Recurring + addon lines: always included at full amount. Each
    -- line carries source_subscription_item_id + service period so
    -- the fatura↔subscrição editor sees this invoice as fully linked
    -- (no fallback needed) and the PDF prints the period.
    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      line_amount := round(item.amount::numeric, 2);
      insert into public.invoice_items (
        invoice_id, description, quantity, unit_price, position,
        source_subscription_item_id, service_start_date, service_end_date
      )
      values (
        new_invoice_id,
        item.description || ' — ' || period_label,
        1,
        line_amount,
        item.position,
        item.id,
        service_start,
        service_end
      )
      returning id into inserted_item_id;

      -- Close the inverse link so future edits on the subscription
      -- side can resolve to this invoice line via a single column
      -- lookup. We always overwrite (not "if null") so the pointer
      -- tracks the *most recent* invoice line for that recurring
      -- item — which is what the sync helpers expect when they
      -- propagate an edit forwards.
      update public.subscription_items
      set source_invoice_item_id = inserted_item_id
      where id = item.id;
    end loop;

    -- Setup lines: only on first invoice, only if not yet invoiced.
    -- These are one-off, so service_start/end stay NULL (the period
    -- columns are not meaningful for setup fees).
    if is_first_invoice then
      for item in
        select * from public.subscription_items
        where subscription_id = sub.id
          and kind = 'setup'
          and invoiced_at is null
        order by position, created_at
      loop
        insert into public.invoice_items (
          invoice_id, description, quantity, unit_price, position,
          source_subscription_item_id
        )
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          1000 + item.position,
          item.id
        )
        returning id into inserted_item_id;

        update public.subscription_items
        set invoiced_at = now(),
            source_invoice_item_id = inserted_item_id
        where id = item.id;
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

grant execute on function public.generate_subscription_invoices() to authenticated, service_role;
