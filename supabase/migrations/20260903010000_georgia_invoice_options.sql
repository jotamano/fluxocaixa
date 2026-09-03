-- Configurable document copy and payment metadata for Georgia invoices.
-- The values are copied to each invoice so historical documents keep the
-- wording and payment instructions used at the time of issue.
alter table public.app_settings
  add column if not exists georgia_invoice_tax_label text not null default 'Tratamento de IVA a confirmar',
  add column if not exists georgia_invoice_tax_note text not null default 'O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.',
  add column if not exists georgia_invoice_payment_terms text not null default 'Pagamento até 30 dias após a data de emissão.',
  add column if not exists georgia_invoice_footer_note text not null default 'Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.';

comment on column public.app_settings.georgia_invoice_tax_label is 'Label shown in the tax treatment block of new Georgia invoices';
comment on column public.app_settings.georgia_invoice_tax_note is 'Configurable tax treatment note shown in new Georgia invoices';
comment on column public.app_settings.georgia_invoice_payment_terms is 'Default payment terms shown in new Georgia invoices';
comment on column public.app_settings.georgia_invoice_footer_note is 'Configurable footer note shown in new Georgia invoices';

alter table public.georgia_invoices
  add column if not exists due_date date,
  add column if not exists service_period text,
  add column if not exists tax_treatment_label text,
  add column if not exists tax_treatment_note text,
  add column if not exists payment_terms text,
  add column if not exists footer_note text;

comment on column public.georgia_invoices.due_date is 'Optional payment due date printed on the invoice';
comment on column public.georgia_invoices.service_period is 'Optional service delivery period printed on the invoice';
comment on column public.georgia_invoices.tax_treatment_label is 'Tax treatment label snapshot for this invoice';
comment on column public.georgia_invoices.tax_treatment_note is 'Tax treatment note snapshot for this invoice';
comment on column public.georgia_invoices.payment_terms is 'Payment terms snapshot for this invoice';
comment on column public.georgia_invoices.footer_note is 'Footer note snapshot for this invoice';
