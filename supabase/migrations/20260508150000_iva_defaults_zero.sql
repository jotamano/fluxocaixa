-- Switch IVA defaults to 0% / disabled.
--
-- The previous defaults (true / 23%) were a backfill safety net so the
-- legacy hardcoded 23% PDF generator stayed correct after the per-client
-- IVA toggle was introduced. Going forward the user wants new
-- clients/subscriptions/invoices to start with **no IVA** unless the
-- operator explicitly opts in. This avoids accidentally taxing freelancer
-- contacts and other non-IVA flows.
--
-- IMPORTANT: we only change the column DEFAULTs. Existing rows keep the
-- value they were created with — silently flipping configured tax data
-- on live invoices would be far worse than a stale default.
--
-- The auto-invoice generator (`generate_subscription_invoices`) already
-- snapshots `has_iva` / `iva_percentage` from the parent subscription, so
-- it inherits the new default automatically once the subscription itself
-- is created with the new defaults.

alter table public.clients
  alter column has_iva set default false,
  alter column iva_percentage set default 0;

alter table public.invoices
  alter column has_iva set default false,
  alter column iva_percentage set default 0;

alter table public.subscriptions
  alter column has_iva set default false,
  alter column iva_percentage set default 0;
