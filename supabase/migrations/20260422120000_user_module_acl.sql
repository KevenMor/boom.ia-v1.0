-- Permissões de módulo por usuário dentro de um tenant
-- Quando existem linhas para (tenant_id, user_id), elas SOBRESCREVEM o tenant_modules para esse usuário.
-- Se não existir nenhuma linha, o usuário herda o tenant_modules normalmente.

CREATE TABLE IF NOT EXISTS public.user_module_acl (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_user_module_acl_tenant_user
  ON public.user_module_acl (tenant_id, user_id);

ALTER TABLE public.user_module_acl ENABLE ROW LEVEL SECURITY;

-- Usuário lê suas próprias linhas
CREATE POLICY "User can read own module acl"
  ON public.user_module_acl FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

-- Superadmin gerencia tudo
CREATE POLICY "Superadmin can manage user_module_acl"
  ON public.user_module_acl FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- Tenant admin gerencia ACL dos membros do seu tenant
CREATE POLICY "Tenant admin can manage user_module_acl"
  ON public.user_module_acl FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- Service role irrestrito
CREATE POLICY "Service role can manage user_module_acl"
  ON public.user_module_acl FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
