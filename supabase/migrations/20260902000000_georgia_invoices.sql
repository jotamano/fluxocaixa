-- Georgia Invoices Table
CREATE TABLE IF NOT EXISTS public.georgia_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  client_name text NOT NULL,
  client_nif text,
  client_address text,
  service_description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD', 'GEL')),
  exchange_rate numeric(12,6) DEFAULT 1.0,
  amount_gel numeric(12,2),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'sent')),
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(user_id, invoice_number)
);

-- Indexes
CREATE INDEX idx_georgia_invoices_user_id ON public.georgia_invoices(user_id);
CREATE INDEX idx_georgia_invoices_date ON public.georgia_invoices(invoice_date);
CREATE INDEX idx_georgia_invoices_status ON public.georgia_invoices(status);

-- RLS Policies
ALTER TABLE public.georgia_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Georgia invoices"
  ON public.georgia_invoices
  FOR SELECT
  USING (auth.uid() = user_id AND (deleted_at IS NULL));

CREATE POLICY "Users can insert their own Georgia invoices"
  ON public.georgia_invoices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Georgia invoices"
  ON public.georgia_invoices
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Georgia invoices"
  ON public.georgia_invoices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to calculate GEL amount
CREATE OR REPLACE FUNCTION public.calculate_gel_amount()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.currency = 'GEL' THEN
    NEW.amount_gel := NEW.amount;
  ELSIF NEW.currency = 'EUR' THEN
    NEW.amount_gel := NEW.amount * COALESCE(NEW.exchange_rate, 2.75);
  ELSIF NEW.currency = 'USD' THEN
    NEW.amount_gel := NEW.amount * COALESCE(NEW.exchange_rate, 2.70);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_gel_amount
  BEFORE INSERT OR UPDATE ON public.georgia_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_gel_amount();
