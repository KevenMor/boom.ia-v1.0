-- Registro de ocorrências (vinculado ao inventário) + ACL opcional por tenant
-- V1: se não existir nenhuma linha em occurrence_module_acl para o tenant, todos os membros com acesso ao tenant podem ver/editar (conforme canAccessTenant / canManageTenant na API).
-- Fase 2: ao inserir uma ou mais linhas em occurrence_module_acl para o tenant, apenas esses user_id passam a ter acesso (superadmin continua com bypass na API).

CREATE TABLE IF NOT EXISTS public.occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'em_andamento', 'resolvida', 'cancelada')),
  severity text NOT NULL DEFAULT 'media'
    CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occurrences_tenant ON public.occurrences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_inventory ON public.occurrences(inventory_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_status ON public.occurrences(status);
CREATE INDEX IF NOT EXISTS idx_occurrences_occurred_at ON public.occurrences(occurred_at DESC);

CREATE OR REPLACE FUNCTION public.update_occurrences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_occurrences_updated_at ON public.occurrences;
CREATE TRIGGER update_occurrences_updated_at
  BEFORE UPDATE ON public.occurrences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_occurrences_updated_at();

ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage occurrences" ON public.occurrences;
CREATE POLICY "Authenticated users can manage occurrences"
  ON public.occurrences FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage occurrences" ON public.occurrences;
CREATE POLICY "Service role can manage occurrences"
  ON public.occurrences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ACL opcional: quando houver linhas para um tenant, a API restringe a esses utilizadores.
CREATE TABLE IF NOT EXISTS public.occurrence_module_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_manage boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_occurrence_module_acl_tenant ON public.occurrence_module_acl(tenant_id);
CREATE INDEX IF NOT EXISTS idx_occurrence_module_acl_user ON public.occurrence_module_acl(user_id);

CREATE OR REPLACE FUNCTION public.update_occurrence_module_acl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_occurrence_module_acl_updated_at ON public.occurrence_module_acl;
CREATE TRIGGER update_occurrence_module_acl_updated_at
  BEFORE UPDATE ON public.occurrence_module_acl
  FOR EACH ROW
  EXECUTE FUNCTION public.update_occurrence_module_acl_updated_at();

ALTER TABLE public.occurrence_module_acl ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage occurrence_module_acl" ON public.occurrence_module_acl;
CREATE POLICY "Authenticated users can manage occurrence_module_acl"
  ON public.occurrence_module_acl FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage occurrence_module_acl" ON public.occurrence_module_acl;
CREATE POLICY "Service role can manage occurrence_module_acl"
  ON public.occurrence_module_acl FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Módulo occurrences habilitado para PPL Motors (alinhado ao seed de inventory)
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
VALUES ('bc4a1dc9-a205-4b4b-9b6c-47bf677a2728', 'occurrences', true)
ON CONFLICT (tenant_id, module_key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now();
