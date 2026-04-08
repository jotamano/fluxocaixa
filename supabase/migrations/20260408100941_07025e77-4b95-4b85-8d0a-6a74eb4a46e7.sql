
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  service_type public.service_type NOT NULL,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read services" ON public.services FOR SELECT TO public USING (true);
CREATE POLICY "Public insert services" ON public.services FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update services" ON public.services FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete services" ON public.services FOR DELETE TO public USING (true);

-- Seed default services
INSERT INTO public.services (name, default_price, service_type) VALUES
  ('Gestão de Redes Sociais', 250, 'social_media'),
  ('Criação de Sites', 800, 'website'),
  ('Marketing Digital', 350, 'marketing'),
  ('Subscrição', 50, 'subscription');
