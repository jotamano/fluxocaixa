-- Categories were never useful in practice — services + descriptions cover
-- everything we need for grouping/filtering. Drop the standalone categories
-- catalog and the FKs in services / subscriptions / subscription_items /
-- invoice_items. The columns are dropped (not just nulled) so the schema is
-- consistent with the frontend, which no longer references them.

ALTER TABLE invoice_items DROP COLUMN IF EXISTS category_id;
ALTER TABLE subscription_items DROP COLUMN IF EXISTS category_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS category_id;
ALTER TABLE services DROP COLUMN IF EXISTS category_id;

DROP TABLE IF EXISTS service_categories;
