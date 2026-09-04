-- Links a Georgia invoice to the original internal invoice it was imported
-- from. The unique index allows manually-created Georgia invoices (NULL
-- source) while preventing the same source from being imported twice.
alter table public.georgia_invoices
  add column if not exists source_invoice_id uuid references public.invoices(id) on delete set null;

create unique index if not exists georgia_invoices_user_source_invoice_uidx
  on public.georgia_invoices(user_id, source_invoice_id);

comment on column public.georgia_invoices.source_invoice_id is
  'Internal link to the original invoice imported into this Georgia invoice';
