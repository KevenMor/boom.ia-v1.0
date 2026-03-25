-- Allow authenticated users to create new tenants
-- When a user creates a tenant, trigger adds them as tenant_admin

DROP POLICY IF EXISTS "Users can create tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant admin can update own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Tenants allow insert for authenticated" ON public.tenants;

-- Allow authenticated users to INSERT new tenants (create)
-- WITH CHECK (true) because trigger will validate and add membership
CREATE POLICY "Tenants allow insert for authenticated"
  ON public.tenants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow tenant admins to UPDATE their own tenant
CREATE POLICY "Tenant admin can update own tenant"
  ON public.tenants FOR UPDATE
  TO authenticated
  USING (public.user_is_tenant_admin(id))
  WITH CHECK (public.user_is_tenant_admin(id));

-- Trigger removido: membership inserido pelo backend com user_id extraído do JWT
DROP TRIGGER IF EXISTS trg_add_tenant_creator_as_admin ON public.tenants;
DROP FUNCTION IF EXISTS public.add_tenant_creator_as_admin();
