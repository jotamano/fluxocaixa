-- Make automatic invoice generation resilient to the server being off.
--
-- Background — two independent reasons the daily invoice cron could
-- silently fail to bill subscriptions on a self-hosted box that is not
-- running 24/7 (e.g. an office machine shut down overnight):
--
--   1. pg_cron only fires while Postgres is up and has NO catch-up for
--      missed runs. The job was scheduled at 03:30 UTC (`30 3 * * *`) —
--      precisely when such a machine is most likely powered off — so on
--      many nights `generate_subscription_invoices()` never ran at all.
--
--   2. Even when it did run, the function billed only ONE period per
--      subscription per run: the cursor over overdue subscriptions is
--      materialised once and `next_billing_date` is advanced by a single
--      frequency step. A subscription overdue by N periods therefore
--      needed N separate successful runs to catch up. If the box only
--      runs intermittently the backlog never clears.
--
-- Fix:
--   * Re-create `generate_subscription_invoices()` with an inner
--     catch-up loop. For each active subscription we now keep emitting
--     invoices (one per missed period, with the correct period label and
--     service dates for that period) until `next_billing_date` is back in
--     the future. A single run now fully catches up no matter how long
--     the server was offline. Setup fees and the first-invoice flag are
--     still applied exactly once (on the earliest missed period only).
--   * Re-schedule the cron hourly (`30 * * * *`) instead of once a day.
--     The function is idempotent at day granularity (it only touches
--     subscriptions whose `next_billing_date <= current_date`, and each
--     emitted invoice pushes that date at least a full period into the
--     future), so running it every hour never double-bills — it just
--     guarantees that whenever the machine is on, any backlog is cleared
--     within the hour instead of waiting for a fixed 03:30 window that
--     may never come.
--
-- Behaviour is otherwise identical to 20260525200000_fix_cron_drop_prorate_branch.sql
-- (no pro-rata, no category_id, service dates from the app_settings
-- offset, source_subscription_item_id linking).

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
  -- Mutable billing date, advanced once per emitted invoice so a single
  -- run can catch up every period missed while the server was off.
  cur_billing date;
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
    cur_billing := sub.next_billing_date;

    -- Catch-up loop: emit one invoice per missed billing period until
    -- the subscription's next billing date is back in the future.
    while cur_billing <= today loop
      -- Allocate next invoice number for the year. Recomputed each
      -- iteration so back-to-back catch-up invoices get sequential
      -- numbers (the previous insert is visible in this transaction).
      select coalesce(max(
        (regexp_match(number, '/(\d+)$'))[1]::int
      ), 0) + 1
      into next_num
      from public.invoices
      where number like 'FT ' || extract(year from today)::text || '/%';

      invoice_number := 'FT ' || extract(year from today)::text || '/' || lpad(next_num::text, 3, '0');
      due_date := today + interval '30 days';
      period_label := pt_months[extract(month from cur_billing)::int] || ' ' || extract(year from cur_billing)::text;

      -- Service period covered by this invoice. The offset is applied
      -- so that operators using a non-default value (e.g. -1 for "bill
      -- one day early") still see the correct end-of-service date on
      -- the line.
      service_end := cur_billing - offset_days;
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

      -- Setup lines: only on the first invoice ever emitted for the
      -- subscription, only if not yet invoiced. These are one-off, so
      -- service_start/end stay NULL (the period columns are not
      -- meaningful for setup fees).
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

      -- Advance to the next period and remember we have now billed at
      -- least once (so later catch-up iterations skip setup fees).
      cur_billing := case sub.frequency
                       when 'monthly'   then cur_billing + interval '1 month'
                       when 'quarterly' then cur_billing + interval '3 months'
                       when 'yearly'    then cur_billing + interval '1 year'
                     end::date;
      is_first_invoice := false;
      generated_count := generated_count + 1;
    end loop;

    -- Persist the fully caught-up billing date once per subscription.
    update public.subscriptions
    set next_billing_date = cur_billing,
        first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
    where id = sub.id;
  end loop;

  return generated_count;
end;
$$;

grant execute on function public.generate_subscription_invoices() to authenticated, service_role;

-- Re-schedule hourly so a powered-off 03:30 window no longer means a
-- skipped day. Safe to run every hour because the function is a no-op
-- once every subscription's next_billing_date is in the future.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('generate-subscription-invoices')
      from cron.job where jobname = 'generate-subscription-invoices';
    perform cron.schedule(
      'generate-subscription-invoices',
      '30 * * * *',
      $cron$ select public.generate_subscription_invoices(); $cron$
    );
  else
    raise warning 'pg_cron not installed: generate_subscription_invoices() will NOT run automatically. Install pg_cron or invoke the function from an external scheduler.';
  end if;
end$$;
