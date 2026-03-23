-- RBAC + escopo por tenant

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('superadmin', 'tenant_admin', 'tenant_user');
  END IF;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.app_role
  USING (
    CASE
      WHEN role = 'admin' THEN 'superadmin'
      WHEN role = 'superadmin' THEN 'superadmin'
      WHEN role = 'tenant_admin' THEN 'tenant_admin'
      WHEN role = 'tenant_user' THEN 'tenant_user'
      ELSE 'tenant_user'
    END
  )::public.app_role;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'tenant_user';

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL CHECK (role IN ('tenant_admin', 'tenant_user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id ON public.tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id ON public.tenant_memberships(tenant_id);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = target_tenant_id
        AND tm.role = 'tenant_admin'
    );
$$;

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superadmin can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read profile scope" ON public.profiles;

CREATE POLICY "Users can read profile scope"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_superadmin());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Superadmin can manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- tenant_memberships
DROP POLICY IF EXISTS "Users can read own memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "Superadmin can manage memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "Tenant admin can read memberships from own tenant" ON public.tenant_memberships;
DROP POLICY IF EXISTS "Tenant admin can manage memberships from own tenant" ON public.tenant_memberships;

CREATE POLICY "Users can read own memberships"
  ON public.tenant_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin() OR public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Superadmin can manage memberships"
  ON public.tenant_memberships FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Tenant admin can manage memberships from own tenant"
  ON public.tenant_memberships FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

-- tenants
DROP POLICY IF EXISTS "Admins can manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant scoped select tenants" ON public.tenants;
DROP POLICY IF EXISTS "Superadmin can manage tenants" ON public.tenants;

CREATE POLICY "Tenant scoped select tenants"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(id));

CREATE POLICY "Superadmin can manage tenants"
  ON public.tenants FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- tenant_modules
DROP POLICY IF EXISTS "Authenticated users can view tenant modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Authenticated users can upsert tenant modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Authenticated users can update tenant modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Tenant scoped select tenant_modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Tenant admin can manage tenant_modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Superadmin can manage tenant_modules" ON public.tenant_modules;

CREATE POLICY "Tenant scoped select tenant_modules"
  ON public.tenant_modules FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage tenant_modules"
  ON public.tenant_modules FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Superadmin can manage tenant_modules"
  ON public.tenant_modules FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

-- inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Service role can manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Anon can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Anon can upsert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Anon can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Tenant scoped select inventory" ON public.inventory;
DROP POLICY IF EXISTS "Tenant admin can manage inventory" ON public.inventory;

CREATE POLICY "Tenant scoped select inventory"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage inventory"
  ON public.inventory FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage inventory"
  ON public.inventory FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage contacts" ON public.contacts;
DROP POLICY IF EXISTS "Service role can manage contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant scoped select contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant admin can manage contacts" ON public.contacts;

CREATE POLICY "Tenant scoped select contacts"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage contacts"
  ON public.contacts FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage contacts"
  ON public.contacts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- contact_invoices
ALTER TABLE public.contact_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage contact_invoices" ON public.contact_invoices;
DROP POLICY IF EXISTS "Service role can manage contact_invoices" ON public.contact_invoices;
DROP POLICY IF EXISTS "Tenant scoped select contact_invoices" ON public.contact_invoices;
DROP POLICY IF EXISTS "Tenant admin can manage contact_invoices" ON public.contact_invoices;

CREATE POLICY "Tenant scoped select contact_invoices"
  ON public.contact_invoices FOR SELECT
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "Tenant admin can manage contact_invoices"
  ON public.contact_invoices FOR ALL
  TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

CREATE POLICY "Service role can manage contact_invoices"
  ON public.contact_invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
