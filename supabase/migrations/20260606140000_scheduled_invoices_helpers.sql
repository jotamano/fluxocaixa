-- Support for the "Faturas agendadas" page:
--   * Extract the per-period invoice emission into a single helper
--     `_emit_subscription_invoice()` so the bulk cron generator and the
--     new one-click "gerar agora / antecipar" action share identical
--     logic (no divergence in numbering, links or service dates).
--   * `generate_subscription_invoice_now(uuid)` — emit the next invoice
--     for ONE subscription immediately (even if its next_billing_date is
--     still in the future), advancing the cycle by one period. Powers the
--     "antecipar" / "regenerar em caso de erro" buttons.
--   * `cron_invoice_status()` — expose the schedule + last run result of
--     the `generate-subscription-invoices` pg_cron job to the UI (the
--     `cron` schema is not reachable through PostgREST directly).
--
-- Behaviour of the bulk generator is unchanged from
-- 20260606130000_cron_catchup_and_resilient_schedule.sql.

-- ── Shared emission helper ────────────────────────────────────────────
-- Emits exactly one invoice for `p_sub_id` covering the billing period
-- `p_billing`. Does NOT advance next_billing_date — the caller owns the
-- cycle bookkeeping so it can loop (catch-up) or run once (antecipar).
create or replace function public._emit_subscription_invoice(
  p_sub_id uuid,
  p_billing date,
  p_is_first boolean,
  p_today date,
  p_offset_days int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  item record;
  next_num integer;
  invoice_number text;
  due_date date;
  new_invoice_id uuid;
  line_amount numeric;
  inserted_item_id uuid;
  period_label text;
  service_end date;
  service_start date;
  pt_months text[] := array[
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
begin
  select id, client_id, name, frequency, start_date
  into sub
  from public.subscriptions
  where id = p_sub_id;

  -- Allocate next invoice number for the issue year.
  select coalesce(max(
    (regexp_match(number, '/(\d+)$'))[1]::int
  ), 0) + 1
  into next_num
  from public.invoices
  where number like 'FT ' || extract(year from p_today)::text || '/%';

  invoice_number := 'FT ' || extract(year from p_today)::text || '/' || lpad(next_num::text, 3, '0');
  due_date := p_today + interval '30 days';
  period_label := pt_months[extract(month from p_billing)::int] || ' ' || extract(year from p_billing)::text;

  service_end := p_billing - p_offset_days;
  if p_is_first then
    service_start := sub.start_date;
  else
    service_start := case sub.frequency
                       when 'monthly'   then service_end - interval '1 month' + interval '1 day'
                       when 'quarterly' then service_end - interval '3 months' + interval '1 day'
                       when 'yearly'    then service_end - interval '1 year' + interval '1 day'
                     end::date;
  end if;

  insert into public.invoices (number, client_id, subscription_id, status, issue_date, due_date, notes)
  values (invoice_number, sub.client_id, sub.id, 'pending', p_today, due_date,
          'Fatura gerada automaticamente da subscrição: ' || sub.name)
  returning id into new_invoice_id;

  -- Recurring + addon lines: full amount, linked + service period stamped.
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

    update public.subscription_items
    set source_invoice_item_id = inserted_item_id
    where id = item.id;
  end loop;

  -- Setup lines: only on the first invoice, only if not yet invoiced.
  if p_is_first then
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

  return new_invoice_id;
end;
$$;

-- Internal helper — not callable by API roles.
revoke all on function public._emit_subscription_invoice(uuid, date, boolean, date, int) from public, anon, authenticated;

-- ── Bulk generator (unchanged behaviour, now via the helper) ──────────
create or replace function public.generate_subscription_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  today date := current_date;
  generated_count integer := 0;
  offset_days int;
  is_first_invoice boolean;
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

    -- Catch-up loop: one invoice per missed period until back in future.
    while cur_billing <= today loop
      perform public._emit_subscription_invoice(sub.id, cur_billing, is_first_invoice, today, offset_days);
      cur_billing := case sub.frequency
                       when 'monthly'   then cur_billing + interval '1 month'
                       when 'quarterly' then cur_billing + interval '3 months'
                       when 'yearly'    then cur_billing + interval '1 year'
                     end::date;
      is_first_invoice := false;
      generated_count := generated_count + 1;
    end loop;

    update public.subscriptions
    set next_billing_date = cur_billing,
        first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
    where id = sub.id;
  end loop;

  return generated_count;
end;
$$;

grant execute on function public.generate_subscription_invoices() to authenticated, service_role;

-- ── One-click generate for a single subscription ──────────────────────
-- Emits the next invoice for the given active subscription right now,
-- even if next_billing_date is still in the future ("antecipar"), and
-- advances the cycle by one period. Returns the new invoice id, or NULL
-- if the subscription is not active / not found.
create or replace function public.generate_subscription_invoice_now(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  today date := current_date;
  offset_days int;
  is_first_invoice boolean;
  new_invoice_id uuid;
begin
  select *
  into sub
  from public.subscriptions
  where id = p_subscription_id
    and status = 'active'
    and deleted_at is null
  for update;

  if not found then
    return null;
  end if;

  select coalesce((select billing_anchor_offset_days from public.app_settings where id = 1), 1)
  into offset_days;

  is_first_invoice := sub.first_invoice_generated_at is null;

  new_invoice_id := public._emit_subscription_invoice(
    sub.id, sub.next_billing_date, is_first_invoice, today, offset_days
  );

  update public.subscriptions
  set next_billing_date = case sub.frequency
                            when 'monthly'   then sub.next_billing_date + interval '1 month'
                            when 'quarterly' then sub.next_billing_date + interval '3 months'
                            when 'yearly'    then sub.next_billing_date + interval '1 year'
                          end::date,
      first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
  where id = sub.id;

  return new_invoice_id;
end;
$$;

grant execute on function public.generate_subscription_invoice_now(uuid) to authenticated, service_role;

-- ── Cron status for the UI ────────────────────────────────────────────
-- The `cron` schema is not exposed through PostgREST, so surface just
-- the invoice job's schedule + most recent run via a SECURITY DEFINER
-- function the frontend can call over RPC.
create or replace function public.cron_invoice_status()
returns table (
  schedule text,
  active boolean,
  last_run_started timestamptz,
  last_run_finished timestamptz,
  last_status text,
  last_message text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  return query
  select
    j.schedule,
    j.active,
    d.start_time,
    d.end_time,
    d.status,
    d.return_message
  from cron.job j
  left join lateral (
    select start_time, end_time, status, return_message
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by start_time desc
    limit 1
  ) d on true
  where j.jobname = 'generate-subscription-invoices';
end;
$$;

grant execute on function public.cron_invoice_status() to authenticated, service_role;
