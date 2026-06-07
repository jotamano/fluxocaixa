-- WhatsApp: move ALL sending to the browser (drop the pg_net server-side path).
--
-- Why: in the self-hosted Docker setup the Postgres container is on a
-- different network than the whatsapp-hub and cannot reach the host IP, so
-- the pg_net `net.http_post()` calls added in 20260606150000 never reach the
-- hub. Sending from the browser (which CAN reach the hub's public URL) is
-- simpler and reliable.
--
-- This migration:
--   1. drops the pg_net-based senders (`send_invoice_whatsapp`,
--      `_send_invoice_whatsapp`);
--   2. recreates `_emit_subscription_invoice` WITHOUT the auto-send call, so
--      invoice generation no longer touches pg_net;
--   3. adds `invoices.whatsapp_sent_at` so the UI can show a
--      "WhatsApp por enviar" badge and the browser can mark a send as done;
--   4. adds `mark_invoice_whatsapp_sent(uuid)` for the browser to call after
--      a successful send;
--   5. drops the now-unused `pg_net` extension.
--
-- The config columns on app_settings (whatsapp_hub_url / api_key / instance /
-- enabled / auto_send / message_template) and clients.whatsapp_group_jid stay
-- as-is — they are now consumed by the frontend instead of by Postgres.

-- ── 1. Drop the pg_net-based senders ──────────────────────────────────
drop function if exists public.send_invoice_whatsapp(uuid);
drop function if exists public._send_invoice_whatsapp(uuid, boolean);

-- ── 2. Track whether an invoice was already sent over WhatsApp ─────────
alter table public.invoices
  add column if not exists whatsapp_sent_at timestamptz;

-- ── 3. Let the browser stamp a successful send ────────────────────────
-- SECURITY DEFINER so it works regardless of row-level update policies on
-- invoices; only flips the timestamp, nothing else. Idempotent-friendly:
-- callers pass p_sent (defaults to now()) and we only touch live rows.
create or replace function public.mark_invoice_whatsapp_sent(
  p_invoice_id uuid,
  p_sent timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  result timestamptz;
begin
  update public.invoices
  set whatsapp_sent_at = p_sent
  where id = p_invoice_id and deleted_at is null
  returning whatsapp_sent_at into result;
  return result;
end;
$$;

grant execute on function public.mark_invoice_whatsapp_sent(uuid, timestamptz)
  to authenticated, service_role;

-- ── 4. Recreate the emission helper without the pg_net auto-send ───────
-- Identical to 20260606140000_scheduled_invoices_helpers.sql; the only
-- difference vs 20260606150000 is that the trailing auto-send call (and its
-- `ignore_send` variable) are gone. Invoices are created with
-- whatsapp_sent_at = NULL and the browser sends them when the app is open.
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

revoke all on function public._emit_subscription_invoice(uuid, date, boolean, date, int) from public, anon, authenticated;

-- ── 5. Drop the now-unused pg_net extension ───────────────────────────
-- Nothing else in the schema uses pg_net once the senders above are gone.
drop extension if exists pg_net;

-- Make the new function / column visible to PostgREST immediately.
notify pgrst, 'reload schema';
