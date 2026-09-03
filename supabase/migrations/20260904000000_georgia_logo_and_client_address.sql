-- Company logo is stored in a public bucket because it is printed in invoices.
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do update set public = true;

create policy "Authenticated users can read company assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'company-assets');

create policy "Authenticated users can upload company assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets');

create policy "Authenticated users can update company assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'company-assets')
  with check (bucket_id = 'company-assets');

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
