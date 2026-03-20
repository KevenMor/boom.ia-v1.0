-- Faturas de contatos (CRM)
CREATE TABLE IF NOT EXISTS public.contact_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_invoices_contact ON public.contact_invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_tenant ON public.contact_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_due_date ON public.contact_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_contact_invoices_status ON public.contact_invoices(status);

ALTER TABLE public.contact_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage contact_invoices"
  ON public.contact_invoices FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage contact_invoices"
  ON public.contact_invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_contact_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_contact_invoices_updated_at
  BEFORE UPDATE ON public.contact_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contact_invoices_updated_at();
