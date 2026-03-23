-- Corrige RLS do control plane após RBAC: is_admin() ainda checava role = 'admin',
-- mas profiles.role virou superadmin (enum). Isso bloqueava agents, providers, tools, etc.
--
-- 1) is_admin(uuid) passa a reconhecer admin/superadmin (e row_security off).
-- 2) Substitui políticas "Admins can manage *" por escopo tenant + superadmin,
--    alinhado a user_has_tenant_access / user_is_tenant_admin.
--
-- Autossuficiente: define is_superadmin / user_has_tenant_access / user_is_tenant_admin
-- caso migrações 20260323133000 / 20260323141000 ainda não tenham sido aplicadas.

-- ---------------------------------------------------------------------------
-- tenant_memberships (só cria se não existir — evita erro nas funções abaixo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'tenant_user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON public.tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON public.tenant_memberships(tenant_id);

-- ---------------------------------------------------------------------------
-- Helpers RBAC (SECURITY DEFINER + row_security off)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(trim(p.role::text)) IN ('admin', 'superadmin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = target_tenant_id
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = target_tenant_id
        AND lower(trim(tm.role::text)) = 'tenant_admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- is_admin: compatível com legado + RBAC (não depender só de 'admin')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND lower(trim(p.role::text)) IN ('admin', 'superadmin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- providers: só plataforma (superadmin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage providers" ON public.providers;

CREATE POLICY "Superadmin can manage providers"
  ON public.providers
  FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- agents: leitura por tenant; escrita por tenant_admin ou superadmin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage agents" ON public.agents;

CREATE POLICY "Tenant scoped select agents"
  ON public.agents
  FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin insert agents"
  ON public.agents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admin update agents"
  ON public.agents
  FOR UPDATE
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admin delete agents"
  ON public.agents
  FOR DELETE
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- tools: tenant_id NULL = global; leitura ampla para authenticated no escopo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage tools" ON public.tools;

CREATE POLICY "Tools select scoped"
  ON public.tools
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin()
    OR tenant_id IS NULL
    OR public.user_has_tenant_access(tenant_id)
  );

CREATE POLICY "Tools insert scoped"
  ON public.tools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );

CREATE POLICY "Tools update scoped"
  ON public.tools
  FOR UPDATE
  TO authenticated
  USING (
    public.is_superadmin()
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );

CREATE POLICY "Tools delete scoped"
  ON public.tools
  FOR DELETE
  TO authenticated
  USING (
    public.is_superadmin()
    OR (tenant_id IS NOT NULL AND public.user_is_tenant_admin(tenant_id))
  );

-- ---------------------------------------------------------------------------
-- agent_tools: derivado do agente (tenant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage agent_tools" ON public.agent_tools;

CREATE POLICY "Agent tools select"
  ON public.agent_tools
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_id
        AND public.user_has_tenant_access(a.tenant_id)
    )
  );

CREATE POLICY "Agent tools insert"
  ON public.agent_tools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_id
        AND public.user_is_tenant_admin(a.tenant_id)
    )
  );

CREATE POLICY "Agent tools update"
  ON public.agent_tools
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_id
        AND public.user_is_tenant_admin(a.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_id
        AND public.user_is_tenant_admin(a.tenant_id)
    )
  );

CREATE POLICY "Agent tools delete"
  ON public.agent_tools
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agents a
      WHERE a.id = agent_id
        AND public.user_is_tenant_admin(a.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Superadmin can view audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- tenants: remove política legada que ainda usa só is_admin (se existir)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage tenants" ON public.tenants;

NOTIFY pgrst, 'reload schema';
