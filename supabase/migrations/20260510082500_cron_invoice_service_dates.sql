-- Replace `generate_subscription_invoices()` so cron-emitted lines carry
-- the same fields the client-side flows fill in by hand:
--
--   * `source_subscription_item_id` — the 1:1 link back to the
--     subscription_items row that produced the line. This is the
--     primary path used by the bidirectional sync; without it the
--     sub→invoice direction silently no-ops on auto-generated
--     invoices and falls back to the per-invoice `subscription_id`
--     fallback added in PR #61.
--
--   * `service_start_date` / `service_end_date` — the actual period
--     the line bills for. Previously these columns were left NULL on
--     cron-generated lines, so the PDF + InvoiceDetail's "Período do
--     serviço" rendered empty until the operator opened the invoice
--     and re-typed the dates.
--
--   * `subscription_items.source_invoice_item_id` — the inverse
--     pointer is also closed for the recurring line, mirroring what
--     `useAddInvoice` already does for client-side flows.
--
-- The service period is inferred from the offset configured in
-- app_settings (PR #63):
--   service_end_date := sub.next_billing_date - offset_days
--   service_start_date := first invoice → sub.start_date
--                         else        → service_end_date - <freq> + 1 day
--
-- Setup lines are one-off (no period) so their dates stay NULL.

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
    -- Each line carries source_subscription_item_id + service period
    -- so the fatura↔subscrição editor sees this invoice as fully
    -- linked (no fallback needed) and the PDF prints the period.
    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      line_amount := round((item.amount * prorate_factor)::numeric, 2);
      insert into public.invoice_items (
        invoice_id, description, quantity, unit_price, category_id, position,
        source_subscription_item_id, service_start_date, service_end_date
      )
      values (
        new_invoice_id,
        item.description || ' — ' || period_label ||
          case when prorate_factor < 0.999 then ' (pro-rata)' else '' end,
        1,
        line_amount,
        coalesce(item.category_id, sub.category_id),
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
          invoice_id, description, quantity, unit_price, category_id, position,
          source_subscription_item_id
        )
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          coalesce(item.category_id, sub.category_id),
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
