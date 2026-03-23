-- Normaliza dados legados para o papel novo de superadmin.
-- Mantém compatibilidade com ambientes em que profiles.role ainda é texto.
DO $$
DECLARE
  role_type text;
BEGIN
  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
  INTO role_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles'
    AND a.attname = 'role'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF role_type = 'app_role' THEN
    -- Enum novo: apenas garante dados nulos.
    UPDATE public.profiles
    SET role = 'tenant_user'::public.app_role
    WHERE role IS NULL;
  ELSE
    -- Texto legado: converte admin -> superadmin e aplica fallback seguro.
    UPDATE public.profiles
    SET role = CASE
      WHEN role::text = 'admin' THEN 'superadmin'
      WHEN role::text IN ('superadmin', 'tenant_admin', 'tenant_user') THEN role::text
      ELSE 'tenant_user'
    END;
  END IF;
END $$;
