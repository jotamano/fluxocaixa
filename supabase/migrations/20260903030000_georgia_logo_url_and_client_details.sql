-- Logo URL is externally hosted; this self-hosted Supabase stack does not run Storage.
alter table public.app_settings
  add column if not exists georgia_company_logo_url text;

alter table public.clients
  add column if not exists address text not null default '';

alter table public.georgia_invoices
  add column if not exists issuer_logo_url text,
  add column if not exists client_email text,
  add column if not exists client_phone text,
  add column if not exists client_company text,
  add column if not exists client_country text;
