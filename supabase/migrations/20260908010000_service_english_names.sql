-- Optional English service name used on English Georgia invoice copies.
alter table public.services
  add column if not exists name_en text;

comment on column public.services.name_en is 'Optional English service name for English invoice copies';
