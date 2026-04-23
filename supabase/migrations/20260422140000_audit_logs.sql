-- Evolui a tabela audit_logs existente para suportar auditoria multi-tenant completa
-- A tabela já existe com: id, user_id, action, entity_type, entity_id, details, ip_address, created_at
-- Adicionamos as colunas novas com ADD COLUMN IF NOT EXISTS

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id    uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_email   text,
  ADD COLUMN IF NOT EXISTS user_name    text,
  ADD COLUMN IF NOT EXISTS resource     text,
  ADD COLUMN IF NOT EXISTS resource_id  text,
  ADD COLUMN IF NOT EXISTS resource_label text,
  ADD COLUMN IF NOT EXISTS metadata     jsonb;

-- Preenche resource a partir de entity_type para registros antigos
UPDATE public.audit_logs SET resource = entity_type WHERE resource IS NULL AND entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_logs_tenant_id_idx  ON public.audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx   ON public.audit_logs (resource);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- Remove políticas antigas que podem conflitar
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "service_role_all" ON public.audit_logs;
DROP POLICY IF EXISTS "tenant_member_read" ON public.audit_logs;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- service_role acesso total (backend usa service_role key)
CREATE POLICY "service_role_all" ON public.audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Members leem logs do próprio tenant
CREATE POLICY "tenant_member_read" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
  );
