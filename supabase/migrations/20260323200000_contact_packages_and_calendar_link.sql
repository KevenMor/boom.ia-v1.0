-- Gestão de Pacotes/Serviços de Clientes + Vínculo de Agenda

-- 1. Adicionar contact_id na tabela calendar_events (soft link)
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_contact
  ON public.calendar_events (contact_id)
  WHERE contact_id IS NOT NULL;

-- 2. Nova tabela: contact_packages (pacotes/serviços contratados)
CREATE TABLE IF NOT EXISTS public.contact_packages (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id       UUID         NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tenant_id        UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT         NOT NULL,
  description      TEXT,
  status           TEXT         NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  price            NUMERIC(12,2),
  start_date       DATE,
  end_date         DATE,
  sessions_total   INTEGER,
  sessions_used    INTEGER      NOT NULL DEFAULT 0,
  metadata         JSONB        DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_packages_contact ON public.contact_packages(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_packages_tenant  ON public.contact_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_packages_status  ON public.contact_packages(status);

ALTER TABLE public.contact_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage contact_packages"
  ON public.contact_packages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage contact_packages"
  ON public.contact_packages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_contact_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_contact_packages_updated_at
  BEFORE UPDATE ON public.contact_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_contact_packages_updated_at();
