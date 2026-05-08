-- Members management: list / invite / delete authenticated users.
--
-- The deployment has GoTrue (supabase/gotrue:v2.158.1) with
-- DISABLE_SIGNUP=true, so the standard supabase.auth.signUp() flow is
-- closed off — the operator was meant to create users via the Studio
-- dashboard. This migration adds three SECURITY DEFINER SQL functions
-- so the app's UI can do that directly:
--
--   * public.list_members()           -> list auth.users (id, email, last_sign_in)
--   * public.invite_member(email, password) -> create a user that can
--     immediately log in. We bypass GoTrue's HTTP API and write to
--     auth.users + auth.identities directly because there's no
--     internal HTTP client inside Postgres. Password is hashed with
--     bcrypt via pgcrypto's crypt() — same algorithm GoTrue uses.
--   * public.delete_member(user_id)   -> remove a user. Self-delete is
--     blocked.
--
-- Permissions: all three functions are EXECUTE-grantable to
-- authenticated. We deliberately don't add a "role" check (no admin
-- vs editor) — the user explicitly asked for "permissões totais" for
-- every member. If/when we add roles later, gating goes here.
--
-- Audit: invite_member / delete_member writes to auth.users which is
-- *outside* the audit_log triggers (those only cover public.*). We
-- therefore manually insert into public.audit_log with table_name
-- 'auth.users' so the membership changes show up in the audit page
-- alongside everything else.

create extension if not exists pgcrypto;

-- 1. List members. Returns minimal user info; we explicitly do not
-- expose encrypted_password, recovery_token, etc.
create or replace function public.list_members()
returns table (
  id                  uuid,
  email               text,
  created_at          timestamptz,
  last_sign_in_at     timestamptz,
  email_confirmed_at  timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  from auth.users u
  order by u.created_at;
$$;

revoke all on function public.list_members() from public, anon;
grant execute on function public.list_members() to authenticated;

-- 2. Invite (create) a member. Returns the new user_id.
create or replace function public.invite_member(p_email text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_actor_id uuid;
  v_actor_email text;
  v_claims jsonb;
begin
  -- Basic input validation. Mirrors GoTrue's checks so we get the same
  -- behaviour as creating via Studio.
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email inválido.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'A palavra-passe tem de ter pelo menos 6 caracteres.';
  end if;

  -- Fail clearly if the email is already in use, instead of dropping
  -- into the unique-violation message of auth.users.email.
  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'Já existe um membro com o email %.', p_email;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- auth.identities row is what GoTrue looks at on email/password
  -- sign-in. provider_id = user_id::text is the canonical pattern for
  -- the email provider.
  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    null,
    now(),
    now()
  );

  -- Manually log the membership change to public.audit_log because the
  -- regular trigger only covers public.* tables.
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

  insert into public.audit_log (
    actor_user_id, actor_email, action, table_name, row_id, before_data, after_data
  ) values (
    v_actor_id, v_actor_email, 'INSERT', 'auth.users', v_user_id::text,
    null,
    jsonb_build_object('id', v_user_id, 'email', p_email)
  );

  return v_user_id;
end;
$$;

revoke all on function public.invite_member(text, text) from public, anon;
grant execute on function public.invite_member(text, text) to authenticated;

-- 3. Delete a member. Refuses self-delete so an operator can't lock
-- themselves out from a single click.
create or replace function public.delete_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid;
  v_actor_email text;
  v_target_email text;
  v_claims jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if v_claims is not null then
      v_caller_id   := nullif(v_claims->>'sub', '')::uuid;
      v_actor_email := nullif(v_claims->>'email', '');
    end if;
  exception when others then
    v_caller_id := null;
    v_actor_email := null;
  end;

  if v_caller_id is null then
    raise exception 'Não autenticado.';
  end if;
  if v_caller_id = p_user_id then
    raise exception 'Não te podes eliminar a ti próprio.';
  end if;

  select email::text into v_target_email from auth.users where id = p_user_id;
  if v_target_email is null then
    raise exception 'Membro não encontrado.';
  end if;

  -- Identities are FK on user_id with on delete cascade in GoTrue, but
  -- delete explicitly anyway so older self-host installs without the
  -- cascade still work.
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  insert into public.audit_log (
    actor_user_id, actor_email, action, table_name, row_id, before_data, after_data
  ) values (
    v_caller_id, v_actor_email, 'DELETE', 'auth.users', p_user_id::text,
    jsonb_build_object('id', p_user_id, 'email', v_target_email),
    null
  );
end;
$$;

revoke all on function public.delete_member(uuid) from public, anon;
grant execute on function public.delete_member(uuid) to authenticated;
