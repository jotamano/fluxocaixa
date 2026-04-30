-- Adds explicit back-references from subscriptions / subscription_items to
-- the invoice / invoice_item that originated them when they were created
-- via the "Fatura recorrente" toggle in NewInvoice. Until now the link
-- was implicit (same client, similar dates), which made it impossible to
-- say with certainty which subscriptions belong to a given invoice.
--
-- The columns are nullable on purpose: subscriptions created the
-- traditional way (directly from /subscricoes/nova) have no source
-- invoice. Cron-generated invoices already point back to their
-- subscription via invoices.subscription_id, which we keep as-is —
-- this migration only adds the *forward* (subscription → invoice) link.

alter table public.subscriptions
  add column if not exists source_invoice_id uuid
    references public.invoices (id)
    on delete set null;

create index if not exists subscriptions_source_invoice_id_idx
  on public.subscriptions (source_invoice_id);

alter table public.subscription_items
  add column if not exists source_invoice_item_id uuid
    references public.invoice_items (id)
    on delete set null;

create index if not exists subscription_items_source_invoice_item_id_idx
  on public.subscription_items (source_invoice_item_id);
