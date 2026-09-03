-- Configurable issuer profile used by Georgia invoices.
-- The profile is stored on each Georgia invoice as a snapshot so historical
-- documents keep the issuer details that were valid when they were created.
alter table public.app_settings
  add column if not exists georgia_company_name text not null default '',
  add column if not exists georgia_company_address text not null default '',
  add column if not exists georgia_company_tax_id text not null default '',
  add column if not exists georgia_company_country text not null default 'Portugal',
  add column if not exists georgia_company_email text not null default '',
  add column if not exists georgia_company_phone text not null default '',
  add column if not exists georgia_company_registration_number text not null default '',
  add column if not exists georgia_company_bank_details text not null default '';

comment on column public.app_settings.georgia_company_name is 'Legal name of the issuer printed on Georgia invoices';
comment on column public.app_settings.georgia_company_address is 'Full legal address of the issuer printed on Georgia invoices';
comment on column public.app_settings.georgia_company_tax_id is 'Issuer tax identification number printed on Georgia invoices';
comment on column public.app_settings.georgia_company_country is 'Issuer country printed on Georgia invoices';
comment on column public.app_settings.georgia_company_registration_number is 'Optional company registration number printed on Georgia invoices';
comment on column public.app_settings.georgia_company_bank_details is 'Optional payment or bank details printed on Georgia invoices';

alter table public.georgia_invoices
  add column if not exists issuer_name text,
  add column if not exists issuer_address text,
  add column if not exists issuer_tax_id text,
  add column if not exists issuer_country text,
  add column if not exists issuer_email text,
  add column if not exists issuer_phone text,
  add column if not exists issuer_registration_number text,
  add column if not exists issuer_bank_details text;
