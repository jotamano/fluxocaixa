-- Cross-sync IVA across client → subscriptions → unpaid invoices,
-- plus a single RPC to fetch the consolidated edit history of an
-- invoice (its rows + its line items + the linked subscription's
-- rows + items + payments registered against it).
--
-- Why:
--   * IVA was stored independently on clients, subscriptions and
--     invoices. Editing it in one place left the others stale, which
--     contradicts the user's mental model ("se edito num sítio tem
--     que editar em todos").
--   * Once an invoice has any payment recorded it becomes a fiscal
--     document — the sync helper skips both 'paid' and 'partially_paid'
--     status AND any invoice with a linked payment row, even if the
--     status column is briefly out of date. Belt and suspenders.
--   * The history RPC is invoked from InvoiceDetail to render a per-
--     invoice changelog with actor attribution. Reuses the existing
--     audit_log written by the AFTER triggers in
--     20260508100000_audit_log.sql, so no new write surface.

create or replace function public.sync_iva(
  p_source text,
  p_source_id uuid,
  p_has_iva boolean,
  p_iva_percentage numeric
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_client_id uuid;
  v_pct numeric;
begin
  if p_source not in ('client', 'subscription', 'invoice') then
    raise exception 'sync_iva: source inválido (%) — usa client/subscription/invoice', p_source;
  end if;

  -- When IVA is disabled, force the percentage to 0 so the stored
  -- value can never drift from the toggle (the UI also enforces this
  -- on save, but the RPC is the single source of truth).
  v_pct := case when coalesce(p_has_iva, false) then coalesce(p_iva_percentage, 0) else 0 end;

  if p_source = 'client' then
    v_client_id := p_source_id;
  elsif p_source = 'subscription' then
    select s.client_id into v_client_id
    from public.subscriptions s
    where s.id = p_source_id
    limit 1;
  elsif p_source = 'invoice' then
    select i.client_id into v_client_id
    from public.invoices i
    where i.id = p_source_id
    limit 1;
  end if;

  if v_client_id is null then
    raise exception 'sync_iva: cliente não encontrado para % %', p_source, p_source_id;
  end if;

  -- 1) Cliente.
  update public.clients
  set has_iva = p_has_iva,
      iva_percentage = v_pct
  where id = v_client_id
    and (has_iva is distinct from p_has_iva
      or iva_percentage is distinct from v_pct);

  -- 2) Todas as subscrições não-eliminadas do cliente.
  update public.subscriptions
  set has_iva = p_has_iva,
      iva_percentage = v_pct
  where client_id = v_client_id
    and deleted_at is null
    and (has_iva is distinct from p_has_iva
      or iva_percentage is distinct from v_pct);

  -- 3) Faturas em aberto (sem qualquer pagamento registado).
  --    Faturas pagas / parcialmente pagas são documentos fiscais e
  --    não podem ser editadas — para alterações, duplicar e re-emitir.
  update public.invoices
  set has_iva = p_has_iva,
      iva_percentage = v_pct
  where client_id = v_client_id
    and deleted_at is null
    and status not in ('paid', 'partially_paid')
    and not exists (
      select 1 from public.payments p
      where p.invoice_id = invoices.id
        and p.deleted_at is null
    )
    and (has_iva is distinct from p_has_iva
      or iva_percentage is distinct from v_pct);
end;
$$;

revoke all on function public.sync_iva(text, uuid, boolean, numeric) from public, anon;
grant execute on function public.sync_iva(text, uuid, boolean, numeric) to authenticated;

-- ─── Edit history per invoice ──────────────────────────────────────
-- Returns audit_log rows tied to:
--   * the invoice itself (table_name = 'invoices')
--   * its line items (table_name = 'invoice_items')
--   * any subscription linked to it, in either direction:
--       - invoices.subscription_id (cron-spawned invoice)
--       - subscriptions.source_invoice_id (NewInvoice-spawned sub)
--   * the line items of those subscriptions
--   * payments recorded against the invoice
--
-- Sorted desc by occurred_at, capped at 200 events to keep the panel
-- snappy. The /auditoria page is the place to go for the full log.
create or replace function public.invoice_history(p_invoice_id uuid)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_user_id uuid,
  actor_email text,
  action text,
  table_name text,
  row_id text,
  before_data jsonb,
  after_data jsonb
)
language sql
stable
set search_path = public
as $$
  with
  inv_items as (
    select ii.id::text as item_id
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
  ),
  -- Subscriptions linked in either direction.
  linked_subs as (
    select s.id
    from public.subscriptions s
    where s.id = (select i.subscription_id from public.invoices i where i.id = p_invoice_id)
       or s.source_invoice_id = p_invoice_id
  ),
  linked_sub_items as (
    select si.id::text as item_id
    from public.subscription_items si
    where si.subscription_id in (select id from linked_subs)
  ),
  inv_payments as (
    select pmt.id::text as payment_id
    from public.payments pmt
    where pmt.invoice_id = p_invoice_id
  )
  select
    a.id,
    a.occurred_at,
    a.actor_user_id,
    a.actor_email,
    a.action,
    a.table_name,
    a.row_id,
    a.before_data,
    a.after_data
  from public.audit_log a
  where (a.table_name = 'invoices'           and a.row_id = p_invoice_id::text)
     or (a.table_name = 'invoice_items'      and a.row_id in (select item_id from inv_items))
     or (a.table_name = 'subscriptions'      and a.row_id in (select id::text from linked_subs))
     or (a.table_name = 'subscription_items' and a.row_id in (select item_id from linked_sub_items))
     or (a.table_name = 'payments'           and a.row_id in (select payment_id from inv_payments))
  order by a.occurred_at desc
  limit 200;
$$;

revoke all on function public.invoice_history(uuid) from public, anon;
grant execute on function public.invoice_history(uuid) to authenticated;
