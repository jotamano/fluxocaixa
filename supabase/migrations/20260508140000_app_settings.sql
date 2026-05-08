-- Singleton table for app-wide settings (one row, id = 1).
--
-- billing_anchor_offset_days controls how next_billing_date relates to
-- the recurring service_end_date on the invoice that just closed:
--   * Default 1  -> invoice issued the day AFTER the service ends
--                   (e.g. service 01/05 - 31/05 → next invoice 01/06).
--   * 0          -> invoice issued the SAME day the service ends.
--   * Negative   -> invoice issued BEFORE the service ends (operator
--                   wants to bill clients ahead of time).
--   * Positive N -> invoice issued N days after the service ends.
--
-- We deliberately enforce a tight check (-365..365) so a typo can't
-- silently bump the cycle by years. The cron itself doesn't read this
-- column — it just picks every active sub whose next_billing_date is
-- <= today; the offset only kicks in on the client paths that recompute
-- next_billing_date from a service_end_date (and vice versa).

create table if not exists public.app_settings (
  id smallint primary key check (id = 1),
  billing_anchor_offset_days int not null default 1
    check (billing_anchor_offset_days between -365 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Seed the singleton row. Idempotent so re-runs of the migration are
-- safe.
insert into public.app_settings (id, billing_anchor_offset_days)
values (1, 1)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Every authenticated member can read and update settings; we don't
-- have an admin role (same posture as members management — see
-- 20260508120000_members_management.sql).
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated
  using (true)
  with check (id = 1);

-- Insert/delete are explicitly NOT permitted via RLS — there's only
-- ever one row, seeded by this migration. Service role retains full
-- access for migrations / dashboard maintenance.
revoke all on table public.app_settings from anon;
grant select, update on table public.app_settings to authenticated;
