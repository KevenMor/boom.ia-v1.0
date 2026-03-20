-- Adiciona contact_type para distinguir Leads (WhatsApp) de Clientes (importados/manual)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'lead'
  CHECK (contact_type IN ('lead', 'client'));

CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON public.contacts(contact_type);

COMMENT ON COLUMN public.contacts.contact_type IS 'lead = do Chat/WhatsApp; client = importado ou cadastrado manualmente';
