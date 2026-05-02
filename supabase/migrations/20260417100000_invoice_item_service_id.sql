-- Track which service template each invoice line maps to.
--
-- Until now, the service picker on /faturas/nova was a one-shot quick-fill
-- (set description + default_price, then forget). Reopening "Editar Serviços
-- da Fatura" had no way to show the user which service the line had been
-- created from, so the picker showed "Selecionar serviço" on every saved
-- line — confusing.
--
-- The link is intentionally loose:
--   - service_id is OPTIONAL (lots of legacy lines have ad-hoc descriptions
--     that don't map to any service template).
--   - ON DELETE SET NULL so deleting a service template doesn't cascade
--     into ancient invoices.

alter table public.invoice_items
  add column if not exists service_id uuid
    references public.services (id)
    on delete set null;

create index if not exists invoice_items_service_id_idx
  on public.invoice_items (service_id);

-- Best-effort backfill by name match. Two patterns are dominant:
--   1. /faturas/nova — description starts with the exact service name and
--      may be followed by " — Mês Ano" or " (dd/mm/yyyy - dd/mm/yyyy)".
--   2. cron generate_subscription_invoices() — same shape: name + " — "
--      + month + year.
--
-- Only backfill when there is exactly ONE service whose name matches, to
-- avoid mis-linking lines whose description is a prefix of multiple
-- templates ("Gestão" matching both "Gestão Redes" and "Gestão SEO").
-- Idempotent: only touches rows where service_id is currently NULL.
with candidate as (
  select ii.id as invoice_item_id,
         s.id  as service_id
    from public.invoice_items ii
    join public.services s
      on ii.description = s.name
      or ii.description like s.name || ' — %'
      or ii.description like s.name || ' (%'
   where ii.service_id is null
),
unambiguous as (
  -- Postgres has no aggregate min() for uuid, so we pick any element
  -- via array_agg; the HAVING clause guarantees only one distinct
  -- value exists in the bucket so the choice is irrelevant.
  select invoice_item_id, (array_agg(distinct service_id))[1] as service_id
    from candidate
   group by invoice_item_id
  having count(distinct service_id) = 1
)
update public.invoice_items ii
   set service_id = u.service_id
  from unambiguous u
 where ii.id = u.invoice_item_id
   and ii.service_id is null;
