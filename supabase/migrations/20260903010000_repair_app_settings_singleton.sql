-- Repair installations where the singleton app_settings row was removed.
-- The Settings screen updates id = 1, so without this row PostgREST returns
-- no updated record and the issuer profile cannot be saved.
insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;
