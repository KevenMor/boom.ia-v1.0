-- is_superadmin: SET row_security = off evita EXISTS em profiles falhar ao avaliar RLS
-- em alguns ambientes. Não depende de tenant_memberships.
--
-- Opcional se ainda não tens tenant_memberships. Com RBAC completo, 20260323141000
-- já recria is_superadmin() + as outras helpers (podes ignorar este ficheiro nesse caso).

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

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO service_role;

NOTIFY pgrst, 'reload schema';
