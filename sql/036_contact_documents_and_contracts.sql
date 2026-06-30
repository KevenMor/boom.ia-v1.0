-- ============================================================
-- Boom IA — Gestão de clientes: documentos e contratos
-- Execute no Supabase (SQL Editor) do projeto NEXUS_DB_URL
-- ============================================================

-- Arquivos anexados ao cliente (PDF, imagens, etc.)
CREATE TABLE IF NOT EXISTS public.contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral'
    CHECK (category IN ('geral', 'contrato', 'identidade', 'comprovante', 'outro')),
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_documents_contact ON public.contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_documents_tenant ON public.contact_documents(tenant_id);

-- Contratos formais do cliente
CREATE TABLE IF NOT EXISTS public.contact_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_number TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'cancelled', 'suspended')),
  start_date DATE,
  end_date DATE,
  value NUMERIC(12, 2),
  payment_terms TEXT,
  description TEXT,
  document_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_contracts_contact ON public.contact_contracts(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_contracts_tenant ON public.contact_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_contracts_status ON public.contact_contracts(status);
