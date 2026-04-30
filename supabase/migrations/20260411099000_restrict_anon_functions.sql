-- Revoke EXECUTE on public functions from the unauthenticated `anon` role.
--
-- Why: the previous migration (20260411098000_explicit_grants.sql) ran
--   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
-- plus
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, ...;
-- to unblock PostgREST from complaining about `permission denied` on the
-- `subscription_items` table. That also handed `anon` EXECUTE on every
-- SECURITY DEFINER function, including `generate_subscription_invoices()`
-- — which would let an unauthenticated HTTP call to
--   POST /rest/v1/rpc/generate_subscription_invoices
-- actually create invoices and advance billing dates. Not acceptable.
--
-- This migration:
--   1. Revokes EXECUTE on existing public functions from `anon`.
--   2. Rewrites the default privileges so new functions are only auto-
--      granted to `authenticated` and `service_role`.
--
-- `anon` still keeps USAGE on schema public + SELECT/INSERT/UPDATE on
-- public tables (for the login/sign-up flow that runs before auth), so
-- the app's login page continues to work.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Belt-and-braces: re-assert the grants we actually want so the end
-- state is unambiguous.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
