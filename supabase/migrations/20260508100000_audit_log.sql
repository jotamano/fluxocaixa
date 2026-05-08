-- Audit log of every write to the user-owned tables.
--
-- Why:
--   * The app now supports multiple authenticated members (see
--     20260508120000_members_management.sql). Once more than one person
--     can issue invoices, "who deleted client X?" becomes a real
--     question — including for compliance/accounting after-the-fact
--     reviews.
--   * Combined with the 90-day auto-purge of /lixo
--     (20260508110000_purge_old_trash.sql), the audit log is the long-
--     lived paper trail. Soft-deleted rows go away after 90 days but the
--     audit row stays.
--
-- Design:
--   * One generic trigger function captures auth.uid() / email from the
--     PostgREST JWT claims and records the full before/after rows as
--     JSONB on every INSERT / UPDATE / DELETE.
--   * UPDATE on a row that flips deleted_at IS NULL ↔ NOT NULL is
--     reclassified as SOFT_DELETE / RESTORE so the UI can filter on it
--     directly without diffing JSONB.
--   * The function is SECURITY DEFINER so the writer doesn't need INSERT
--     privilege on audit_log — only SELECT is granted to authenticated.
--   * Trigger errors are swallowed so a misbehaving audit insert can't
--     block legitimate billing operations. The cost of a missed audit
--     row is far smaller than the cost of failing to delete a client.
--   * AFTER triggers (return value ignored) so we record the post-
--     commit state, including any cascade triggers that fired before us.
--
-- Tables instrumented: clients, invoices, invoice_items, subscriptions,
-- subscription_items, payments, services. The audit_log table itself
-- is intentionally NOT instrumented to avoid recursive bloat.

create table if not exists public.audit_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid,
  actor_email     text,
  action          text not null,                  -- INSERT|UPDATE|DELETE|SOFT_DELETE|RESTORE
  table_name      text not null,
  row_id          text,                            -- text so it survives non-uuid PKs in future
  before_data     jsonb,
  after_data      jsonb
);

create index if not exists idx_audit_log_occurred_at on public.audit_log (occurred_at desc);
create index if not exists idx_audit_log_table_name  on public.audit_log (table_name, occurred_at desc);
create index if not exists idx_audit_log_actor       on public.audit_log (actor_user_id, occurred_at desc);
create index if not exists idx_audit_log_row         on public.audit_log (table_name, row_id);

-- Lock the table down: only the trigger function (SECURITY DEFINER, runs
-- as the function owner) writes to it. Authenticated users can read.
alter table public.audit_log enable row level security;

drop policy if exists "Audit log read" on public.audit_log;
create policy "Audit log read" on public.audit_log
  for select to authenticated using (true);

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant select on sequence public.audit_log_id_seq to authenticated;

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid;
  v_actor_email text;
  v_action      text;
  v_row_id      text;
  v_before      jsonb;
  v_after       jsonb;
  v_old_deleted timestamptz;
  v_new_deleted timestamptz;
  v_claims      jsonb;
begin
  -- Pull actor from the PostgREST JWT claims if present. May be NULL
  -- when the operation runs from an internal function (e.g. cascade
  -- trigger started by the cron job) — that's fine, we just record it
  -- as an anonymous system event.
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if v_claims is not null then
      v_actor_id    := nullif(v_claims->>'sub', '')::uuid;
      v_actor_email := nullif(v_claims->>'email', '');
    end if;
  exception when others then
    v_actor_id := null;
    v_actor_email := null;
  end;

  if tg_op = 'INSERT' then
    v_action := 'INSERT';
    v_after  := to_jsonb(new);
    v_row_id := v_after->>'id';
  elsif tg_op = 'DELETE' then
    v_action := 'DELETE';
    v_before := to_jsonb(old);
    v_row_id := v_before->>'id';
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_row_id := v_after->>'id';
    v_action := 'UPDATE';
    if v_before ? 'deleted_at' then
      v_old_deleted := nullif(v_before->>'deleted_at', '')::timestamptz;
      v_new_deleted := nullif(v_after->>'deleted_at',  '')::timestamptz;
      if v_old_deleted is null and v_new_deleted is not null then
        v_action := 'SOFT_DELETE';
      elsif v_old_deleted is not null and v_new_deleted is null then
        v_action := 'RESTORE';
      end if;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, actor_email, action, table_name, row_id, before_data, after_data
  ) values (
    v_actor_id, v_actor_email, v_action, tg_table_name, v_row_id, v_before, v_after
  );

  return null;  -- AFTER triggers ignore the return value.
exception when others then
  -- Never let a broken audit row break the billing operation. Surface
  -- to Postgres logs and continue.
  raise warning 'audit log skipped for %.% (%): %', tg_table_schema, tg_table_name, tg_op, sqlerrm;
  return null;
end;
$$;

revoke all on function public.log_audit_event() from public, anon;

-- Apply the trigger to every user-owned table. We use AFTER so we
-- record the outcome (including effects of cascade triggers that
-- already fired) and we always go for-each-row.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'invoices', 'invoice_items', 'subscriptions',
    'subscription_items', 'payments', 'services'
  ] loop
    -- Skip silently if the table isn't present in this deployment
    -- (e.g. fresh installs that haven't run earlier migrations yet).
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists audit_%s_trg on public.%I', t, t);
      execute format(
        'create trigger audit_%s_trg
           after insert or update or delete on public.%I
           for each row execute function public.log_audit_event()',
        t, t
      );
    end if;
  end loop;
end$$;
