-- ============================================================
-- 050 — Permissão de leitura de Tenant para membros
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

DROP POLICY IF EXISTS "Users can select tenants they are members of" ON public.tenants;
CREATE POLICY "Users can select tenants they are members of"
  ON public.tenants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = public.tenants.id AND user_id = auth.uid()
    )
  );
