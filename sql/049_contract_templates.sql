-- ============================================================
-- 049 — Modelos de contratos e conteúdo gerado
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL, -- O corpo do modelo contendo os placeholders (ex: {{NOME}})
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_tenant ON public.contract_templates (tenant_id);

-- Adiciona coluna de conteúdo preenchido na tabela de contratos gerados
ALTER TABLE public.contact_contracts ADD COLUMN IF NOT EXISTS content TEXT;

-- Habilita segurança de RLS
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para contract_templates
DROP POLICY IF EXISTS "service_role_full_contract_templates" ON public.contract_templates;
CREATE POLICY "service_role_full_contract_templates"
  ON public.contract_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_contract_templates" ON public.contract_templates;
CREATE POLICY "authenticated_all_contract_templates"
  ON public.contract_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
