
CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read service_categories" ON public.service_categories FOR SELECT TO public USING (true);
CREATE POLICY "Public insert service_categories" ON public.service_categories FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update service_categories" ON public.service_categories FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete service_categories" ON public.service_categories FOR DELETE TO public USING (true);

ALTER TABLE public.services ADD COLUMN category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;
