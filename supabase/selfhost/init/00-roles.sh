#!/bin/bash
# Create the Supabase service roles required by PostgREST and GoTrue, plus
# the `auth` schema GoTrue needs for its migrations.
#
# `supabase/postgres` ships with a `supabase_admin` superuser (used here to
# bootstrap) and a `postgres` admin role, but it does NOT create the
# PostgREST/GoTrue service roles automatically. Without this script you'll
# see "Role 'authenticator' does not exist" / "Role 'supabase_auth_admin'
# does not exist" in the logs.
#
# Runs as part of postgres' initdb sequence, so only on the very first boot
# of an empty data directory.
set -euo pipefail

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD must be set" >&2
  exit 1
fi

# `psql` connects locally as the user that initdb created. The supabase
# image defaults POSTGRES_USER to `supabase_admin`, so we use that as the
# bootstrap superuser.
SUPER="${POSTGRES_USER:-supabase_admin}"
DB="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 \
  --username "${SUPER}" \
  --dbname "${DB}" <<-SQL
  -- ─── Service roles ────────────────────────────────────────────────────
  -- PostgREST authenticator: the only LOGIN role of the four. Switches to
  -- anon / authenticated / service_role via SET ROLE based on the JWT.
  DO \$\$
  BEGIN
    -- 'postgres' is referenced by tools (Studio, healthcheck, migrations)
    -- but supabase/postgres only creates 'supabase_admin' by default.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
      EXECUTE format(
        'CREATE ROLE postgres LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    ELSE
      EXECUTE format(
        'ALTER ROLE postgres WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
      EXECUTE format(
        'CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    ELSE
      EXECUTE format(
        'ALTER ROLE authenticator WITH LOGIN PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    END IF;

    -- GoTrue's admin role. Owns the auth schema and runs migrations.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE format(
        'CREATE ROLE supabase_auth_admin LOGIN CREATEROLE NOINHERIT PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    ELSE
      EXECUTE format(
        'ALTER ROLE supabase_auth_admin WITH LOGIN CREATEROLE NOINHERIT PASSWORD %L',
        '${POSTGRES_PASSWORD}'
      );
    END IF;
  END
  \$\$;

  -- ─── Role hierarchy ──────────────────────────────────────────────────
  GRANT anon, authenticated, service_role TO authenticator;

  -- ─── auth schema (for GoTrue) ────────────────────────────────────────
  CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
  GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
  GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;
  -- Make GoTrue create its tables in `auth`, not `public` (which is locked
  -- down in Postgres 15). Without this the GoTrue migrator fails with
  -- "permission denied for schema public" trying to create schema_migrations.
  ALTER ROLE supabase_auth_admin SET search_path TO auth, public;

  -- ─── public schema permissions ───────────────────────────────────────
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
SQL

echo "00-roles.sh: supabase service roles created."
