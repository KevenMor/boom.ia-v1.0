-- Requer public.tenant_memberships (migration 20260323133000_rbac_tenant_memberships_and_rls.sql).
-- Este ficheiro é autossuficiente: define is_superadmin() antes das funções que a invocam
-- (útil se ainda não correu 20260323140000 ou a função não existir no projeto).

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
      AND (
        p.role::text = 'superadmin'
        OR p.role::text = 'admin'
      )
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
        AND tm.role::text = 'tenant_admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO service_role;

-- PostgREST só expõe /rpc após recarregar o schema (evita "function ... not in the schema cache")
NOTIFY pgrst, 'reload schema';
