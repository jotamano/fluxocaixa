#!/usr/bin/env bash
# Apply pending SQL migrations to the marketing-billing-buddy Postgres
# container. Replaces the manual `docker exec -i $DB_CT psql ... < file.sql`
# workflow with an idempotent runner that tracks state in
# public.schema_migrations.
#
# First-run safety: if the schema_migrations table does not yet exist (or
# is empty) AND the application schema already exists — i.e. an existing
# deployment that has been receiving manual migrations up to now — the
# script BACKFILLS the table with all current migration filenames marked
# as already applied. It does NOT re-run them. This makes the script safe
# to roll out on a live database.
#
# Subsequent runs only execute migration files whose filename (without the
# .sql extension) is not yet in schema_migrations.
#
# Usage:
#   ./scripts/apply-migrations.sh                       # auto-detect db container
#   DB_CONTAINER=marketing-billing-buddy-db-1 ./scripts/apply-migrations.sh
#
# Requires the db container of the marketing-billing-buddy compose project
# to be running. The script connects via `docker exec` so no network
# configuration is needed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: $MIGRATIONS_DIR does not exist." >&2
  exit 1
fi

DB_CONTAINER="${DB_CONTAINER:-}"
if [[ -z "$DB_CONTAINER" ]]; then
  # Prefer compose label match (works for both `docker compose` and Coolify
  # which preserves the standard service label).
  DB_CONTAINER=$(docker ps \
    --filter "label=com.docker.compose.service=db" \
    --format '{{.Names}}' | head -1 || true)
fi
if [[ -z "$DB_CONTAINER" ]]; then
  # Fallback: any running container whose name contains "db" segment.
  DB_CONTAINER=$(docker ps --format '{{.Names}}' \
    | grep -E '(^|[-_])db([-_]|$)' \
    | head -1 || true)
fi
if [[ -z "$DB_CONTAINER" ]]; then
  cat >&2 <<EOF
ERROR: could not auto-detect the db container.
       Set DB_CONTAINER=<name> manually. Examples:
         DB_CONTAINER=marketing-billing-buddy-db-1
         DB_CONTAINER=db-v5xudtj41ezyw-...   (Coolify)
EOF
  exit 1
fi
echo "Using db container: $DB_CONTAINER"

PG_DB="${POSTGRES_DB:-postgres}"
PG_USER="${POSTGRES_USER:-postgres}"

# Helper: run a SQL command via docker exec. -t suppresses the password
# prompt; we connect as the postgres superuser via the container's local
# socket so no password is needed.
run_sql() {
  docker exec -i "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" "$@"
}

# Helper: pipe a file's contents to psql. Each migration file is
# executed as-is; statements auto-commit one by one (matching the
# previous `docker exec -i ... psql < file.sql` behaviour). We do not
# wrap files in BEGIN/COMMIT because some migrations (e.g.
# 20260412100000_expand_frequencies.sql) include `ALTER TYPE ... ADD
# VALUE` which Postgres forbids inside a transaction.
run_file() {
  local file="$1"
  docker exec -i "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" < "$file"
}

# 1. Ensure schema_migrations table exists.
run_sql <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
SQL

# 2. Backfill on first run if app schema already exists. Detection: the
#    schema_migrations table is empty AND public.invoices already exists.
applied_count=$(run_sql -tAc "select count(*) from public.schema_migrations" | tr -d '[:space:]')
invoices_exists=$(run_sql -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name='invoices'" | tr -d '[:space:]')

if [[ "$applied_count" == "0" && "$invoices_exists" == "1" ]]; then
  echo
  echo "First run on an existing schema detected."
  echo "Backfilling public.schema_migrations without re-running any SQL."
  values=""
  for f in "$MIGRATIONS_DIR"/*.sql; do
    ver=$(basename "$f" .sql)
    # Single-quote the version, escape single quotes by doubling.
    esc=${ver//\'/\'\'}
    if [[ -n "$values" ]]; then values+=", "; fi
    values+="('$esc')"
  done
  if [[ -n "$values" ]]; then
    run_sql -c "insert into public.schema_migrations(version) values $values on conflict do nothing;" >/dev/null
    echo "Backfilled $(echo "$values" | tr ',' '\n' | wc -l | tr -d ' ') versions."
  fi
fi

# 3. Apply any migration files whose version is not yet in
#    schema_migrations, in lexical order.
pending=0
applied=0
# Bash glob expansion is already lexically sorted (LC_COLLATE=C is the
# default for our YYYYMMDDHHMMSS filenames). No `ls` needed.
for f in "$MIGRATIONS_DIR"/*.sql; do
  ver=$(basename "$f" .sql)
  esc=${ver//\'/\'\'}
  is_applied=$(run_sql -tAc "select 1 from public.schema_migrations where version='$esc'" | tr -d '[:space:]')
  if [[ "$is_applied" == "1" ]]; then
    continue
  fi
  pending=$((pending + 1))
  echo
  echo "→ applying $ver"
  if run_file "$f"; then
    run_sql -c "insert into public.schema_migrations(version) values ('$esc');" >/dev/null
    applied=$((applied + 1))
    echo "  ✓ $ver"
  else
    echo "  ✗ $ver FAILED — fix the migration and re-run." >&2
    exit 1
  fi
done

echo
if [[ $pending -eq 0 ]]; then
  echo "All migrations up to date — nothing to apply."
else
  echo "Applied $applied migration(s)."
fi

# 4. Tell PostgREST to reload its schema cache so any new functions, tables
#    or columns become visible to the REST API immediately. Without this,
#    freshly added RPCs (e.g. generate_subscription_invoice_now) keep
#    returning "Could not find the function ... in the schema cache" until
#    the rest service is restarted. NOTIFY is harmless when nothing changed.
echo
echo "Reloading PostgREST schema cache (notify pgrst, 'reload schema')…"
run_sql -c "notify pgrst, 'reload schema';" >/dev/null \
  && echo "PostgREST schema cache reload signalled." \
  || echo "WARNING: could not signal PostgREST reload (is the db reachable?)." >&2
