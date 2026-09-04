-- Structured service lines for Georgia invoices. This preserves the
-- description, quantity, unit price and service period of every line.
alter table public.georgia_invoices
  add column if not exists service_items jsonb not null default '[]'::jsonb;

comment on column public.georgia_invoices.service_items is
  'Structured service lines: description, quantity, unit_price and service_period';
