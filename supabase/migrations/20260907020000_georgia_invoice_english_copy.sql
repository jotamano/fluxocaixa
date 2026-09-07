-- Editable English copy for Georgia invoice PDFs.
-- The English copy is stored separately from the Portuguese copy and is
-- snapshotted on each invoice so historical documents remain stable.
alter table public.app_settings
  add column if not exists georgia_invoice_en_tax_label text not null default 'VAT treatment to be confirmed',
  add column if not exists georgia_invoice_en_tax_note text not null default 'The VAT treatment must be confirmed according to the type of service, the customer''s tax status and the applicable place of taxation.',
  add column if not exists georgia_invoice_en_payment_terms text not null default 'Payment due within 30 days from the issue date.',
  add column if not exists georgia_invoice_en_footer_note text not null default 'Commercial document. Confirm the applicable tax treatment before final issuance.';

alter table public.georgia_invoices
  add column if not exists tax_treatment_label_en text,
  add column if not exists tax_treatment_note_en text,
  add column if not exists payment_terms_en text,
  add column if not exists footer_note_en text;

comment on column public.app_settings.georgia_invoice_en_tax_label is 'English tax treatment label for Georgia invoice PDFs';
comment on column public.app_settings.georgia_invoice_en_tax_note is 'English tax treatment note for Georgia invoice PDFs';
comment on column public.app_settings.georgia_invoice_en_payment_terms is 'English payment terms for Georgia invoice PDFs';
comment on column public.app_settings.georgia_invoice_en_footer_note is 'English footer note for Georgia invoice PDFs';
