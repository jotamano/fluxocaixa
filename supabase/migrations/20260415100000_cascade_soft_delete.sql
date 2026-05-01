-- Track cascade soft-delete relationships so a parent restore can
-- bring back exactly the rows it knocked over, instead of leaving
-- the user to hunt through /lixo for the children.
--
-- Two new columns:
--   * payments.deleted_via_invoice_id  - set when a payment was
--     soft-deleted as part of cascading an invoice delete (PR for
--     "delete invoice -> remove its payments too").
--   * invoices.deleted_via_subscription_id - set when an unpaid
--     invoice was soft-deleted as part of cascading a subscription
--     delete (PR for "delete subscription -> remove unpaid invoices").
--
-- Both columns are plain UUIDs without a foreign key. We don't want
-- ON DELETE constraints because (a) the parent might itself be
-- soft-deleted and (b) hard-purging the parent should still be
-- possible without first detaching every child manually. The hooks
-- look up the parent by id and treat a missing row as "no cascade
-- needed", so missing references are safe.

alter table public.payments
  add column if not exists deleted_via_invoice_id uuid;

create index if not exists idx_payments_deleted_via_invoice
  on public.payments(deleted_via_invoice_id)
  where deleted_via_invoice_id is not null;

alter table public.invoices
  add column if not exists deleted_via_subscription_id uuid;

create index if not exists idx_invoices_deleted_via_subscription
  on public.invoices(deleted_via_subscription_id)
  where deleted_via_subscription_id is not null;

comment on column public.payments.deleted_via_invoice_id is
  'When NOT NULL, this payment was soft-deleted as a side effect of '
  'soft-deleting the referenced invoice. Restoring that invoice '
  'restores this payment automatically; restoring the payment alone '
  'just brings it back without touching the invoice.';

comment on column public.invoices.deleted_via_subscription_id is
  'When NOT NULL, this invoice was soft-deleted as a side effect of '
  'soft-deleting the referenced subscription. Restoring the '
  'subscription restores this invoice automatically.';
