#!/bin/bash
# Bootstrap Supabase service-account passwords on the very first boot.
#
# supabase/postgres ships with the roles authenticator, supabase_auth_admin,
# supabase_admin, supabase_storage_admin etc., but they have no password
# attached. Without a password PostgREST and GoTrue cannot connect (you'll
# see "password authentication failed for user 'authenticator'" in the logs).
#
# This script runs as part of postgres' initdb sequence and uses the
# POSTGRES_PASSWORD environment variable for every supabase service role.
set -euo pipefail

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "POSTGRES_PASSWORD must be set" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" <<-SQL
  -- Re-use the main POSTGRES_PASSWORD for every Supabase service role.
  -- Keeps secrets management simple at the cost of one shared secret.
  ALTER USER authenticator           WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_auth_admin     WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_admin          WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_storage_admin  WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_realtime_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_replication_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER USER supabase_read_only_user WITH PASSWORD '${POSTGRES_PASSWORD}';

  -- Some tools also expect anon / authenticated to have a password set
  -- (they're login-disabled but do_block_login flips when password is
  -- missing on certain pg versions). Set them just in case.
  DO \$\$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('ALTER USER anon WITH PASSWORD %L', '${POSTGRES_PASSWORD}');
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('ALTER USER authenticated WITH PASSWORD %L', '${POSTGRES_PASSWORD}');
    END IF;
  END
  \$\$;
SQL

echo "00-roles.sh: supabase service roles password set."
