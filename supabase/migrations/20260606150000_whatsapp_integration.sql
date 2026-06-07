-- WhatsApp integration (send invoices to a per-client WhatsApp group via the
-- self-hosted whatsapp-hub public API).
--
-- Design — the app has NO Node backend: the browser talks straight to
-- Postgres/PostgREST. Sending an HTTP request from the browser to the hub
-- would mean (a) exposing the hub API key to the client and (b) fighting
-- CORS / mixed-content (https app → http internal hub). Instead we send
-- from inside Postgres with `pg_net` (already enabled — see
-- 20260408103152_*). The DB can reach the hub over the internal docker
-- network by service name and the request is fire-and-forget (queued by
-- pg_net's background worker, sent after the transaction commits), so it
-- NEVER blocks or breaks invoice generation.
--
-- Config lives in the singleton app_settings row (global hub URL + API key
-- + instance + message template + auto-send toggle). The recipient is the
-- WhatsApp group JID stored per client. Two entry points:
--   * `send_invoice_whatsapp(uuid)` — manual one-click send from the UI.
--     Always sends when WhatsApp is enabled and the client has a group.
--   * auto-send — when an invoice is generated from a subscription (cron,
--     "gerar agora", "gerar pendentes") AND `whatsapp_auto_send` is on.

-- ── Config columns on the singleton settings row ──────────────────────
alter table public.app_settings
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists whatsapp_hub_url text,
  add column if not exists whatsapp_api_key text,
  add column if not exists whatsapp_instance text,
  add column if not exists whatsapp_auto_send boolean not null default false,
  add column if not exists whatsapp_message_template text not null default
    'Olá {cliente}! 👋

Foi emitida a fatura {numero} no valor de {valor}, com vencimento a {vencimento}.

Obrigado!';

-- ── Per-client recipient ──────────────────────────────────────────────
-- The full WhatsApp group JID (e.g. 120363012345678901@g.us). A plain
-- phone number also works (the hub turns it into <digits>@s.whatsapp.net),
-- but the intended use is a group. Copy the JID from the WhatsApp Hub.
alter table public.clients
  add column if not exists whatsapp_group_jid text;

-- ── Internal sender ───────────────────────────────────────────────────
-- Builds the message text from the template + invoice/client data and
-- enqueues an HTTP POST to the hub. Returns a human-readable status. Any
-- failure to enqueue is swallowed (returns the error text) so callers in
-- the invoice-generation path can never abort a transaction.
create or replace function public._send_invoice_whatsapp(
  p_invoice_id uuid,
  p_respect_auto_flag boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  inv record;
  cli record;
  subtotal numeric;
  iva numeric;
  gross numeric;
  client_label text;
  msg text;
  endpoint text;
begin
  select * into s from public.app_settings where id = 1;
  if s is null or s.whatsapp_enabled is not true then
    return 'WhatsApp desativado nas Configurações.';
  end if;
  if p_respect_auto_flag and s.whatsapp_auto_send is not true then
    return 'Auto-envio desativado.';
  end if;
  if coalesce(trim(s.whatsapp_hub_url), '') = ''
     or coalesce(trim(s.whatsapp_api_key), '') = ''
     or coalesce(trim(s.whatsapp_instance), '') = '' then
    return 'Configuração do WhatsApp Hub incompleta (URL, API key e instância).';
  end if;

  select * into inv from public.invoices where id = p_invoice_id and deleted_at is null;
  if inv is null then
    return 'Fatura não encontrada.';
  end if;

  select * into cli from public.clients where id = inv.client_id;
  if cli is null or coalesce(trim(cli.whatsapp_group_jid), '') = '' then
    return 'Cliente sem grupo de WhatsApp definido.';
  end if;

  -- Gross total (subtotal + invoice-level IVA), mirroring the frontend.
  select coalesce(sum(quantity * unit_price), 0)
  into subtotal
  from public.invoice_items
  where invoice_id = inv.id;

  if inv.has_iva and coalesce(inv.iva_percentage, 0) > 0 then
    iva := round(subtotal * inv.iva_percentage / 100.0, 2);
  else
    iva := 0;
  end if;
  gross := round(subtotal + iva, 2);

  client_label := coalesce(nullif(trim(cli.company), ''), nullif(trim(cli.name), ''), 'Cliente');

  msg := s.whatsapp_message_template;
  msg := replace(msg, '{cliente}', client_label);
  msg := replace(msg, '{empresa}', coalesce(nullif(trim(cli.company), ''), client_label));
  msg := replace(msg, '{nome}', coalesce(nullif(trim(cli.name), ''), client_label));
  msg := replace(msg, '{numero}', inv.number);
  msg := replace(msg, '{valor}', trim(to_char(gross, 'FM999G999G990D00')) || ' €');
  msg := replace(msg, '{vencimento}', to_char(inv.due_date, 'DD/MM/YYYY'));
  msg := replace(msg, '{emissao}', to_char(inv.issue_date, 'DD/MM/YYYY'));

  endpoint := rtrim(trim(s.whatsapp_hub_url), '/') || '/v1/messages';

  begin
    perform net.http_post(
      url     := endpoint,
      body    := jsonb_build_object(
                   'instanceName', s.whatsapp_instance,
                   'to',           cli.whatsapp_group_jid,
                   'text',         msg
                 ),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-api-key',    s.whatsapp_api_key
                 )
    );
  exception when others then
    return 'Falha ao enfileirar envio: ' || sqlerrm;
  end;

  return 'Envio enfileirado para ' || cli.whatsapp_group_jid || '.';
end;
$$;

revoke all on function public._send_invoice_whatsapp(uuid, boolean) from public, anon, authenticated;

-- ── Public one-click manual send ──────────────────────────────────────
-- Used by the "Enviar por WhatsApp" button on the invoice page. Always
-- sends (ignores the auto-send flag) as long as WhatsApp is enabled and
-- the client has a group JID. Returns a status string for the UI toast.
create or replace function public.send_invoice_whatsapp(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._send_invoice_whatsapp(p_invoice_id, false);
end;
$$;

grant execute on function public.send_invoice_whatsapp(uuid) to authenticated, service_role;

-- ── Wire auto-send into the shared emission helper ────────────────────
-- Re-create _emit_subscription_invoice (definition unchanged from
-- 20260606140000_scheduled_invoices_helpers.sql) with one addition: after
-- the invoice + lines are created, attempt an auto-send that respects the
-- whatsapp_auto_send flag. The call can never raise (the sender swallows
-- its own errors), so invoice generation is unaffected whether or not the
-- hub is reachable.
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
  ignore_send text;
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

  -- Auto-send to WhatsApp (respects the whatsapp_auto_send flag). Never
  -- raises — _send_invoice_whatsapp captures its own errors.
  ignore_send := public._send_invoice_whatsapp(new_invoice_id, true);

  return new_invoice_id;
end;
$$;

revoke all on function public._emit_subscription_invoice(uuid, date, boolean, date, int) from public, anon, authenticated;
