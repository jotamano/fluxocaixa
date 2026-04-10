-- Add defaults to service_type so it's no longer required in code
ALTER TABLE public.services ALTER COLUMN service_type SET DEFAULT 'social_media'::service_type;
ALTER TABLE public.invoice_items ALTER COLUMN service_type SET DEFAULT 'social_media'::service_type;
ALTER TABLE public.subscriptions ALTER COLUMN service_type SET DEFAULT 'social_media'::service_type;

-- Add category_id to invoice_items
ALTER TABLE public.invoice_items ADD COLUMN category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;

-- Add category_id to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;

-- Backfill subscriptions.category_id from services where possible
UPDATE public.subscriptions s
SET category_id = svc.category_id
FROM public.services svc
WHERE s.name = svc.name AND svc.category_id IS NOT NULL AND s.category_id IS NULL;