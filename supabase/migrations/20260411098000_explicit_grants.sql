-- Explicit GRANTs on every public table to the Supabase service roles.
--
-- Why we need this: 00-roles.sh sets ALTER DEFAULT PRIVILEGES so that
-- *future* tables created by `supabase_admin` are auto-granted to
-- anon/authenticated/service_role. In practice some migration scripts run
-- as `postgres` (not supabase_admin) or the ALTER DEFAULT PRIVILEGES does
-- not cover every permutation (different owner, different schema scope),
-- which leaves tables like `subscription_items` invisible to PostgREST
-- and produces errors like:
--     permission denied for table subscription_items
-- when the frontend tries to INSERT a new item.
--
-- This migration is idempotent (GRANT is a no-op when already granted)
-- and can be re-applied to any existing database via Studio's SQL editor.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Make sure tables created in the future (e.g. by a later migration or by
-- a new feature) also pick up the grants, regardless of which role is
-- creating them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- Cover the common case where a migration was run as `postgres` rather
-- than `supabase_admin`: set default privileges from that role too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
