-- ============================================================
-- Nexus AI — Fix RLS infinite recursion
-- Execute DEPOIS do 001_control_plane.sql
-- ============================================================

-- 1. Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'admin'
  )
$$;

-- 2. Drop old policies that cause recursion
DROP POLICY IF EXISTS "Admins can manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "Admins can manage providers" ON public.providers;
DROP POLICY IF EXISTS "Admins can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Admins can manage tools" ON public.tools;
DROP POLICY IF EXISTS "Admins can manage agent_tools" ON public.agent_tools;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

-- 3. Recreate policies using security definer function
CREATE POLICY "Admins can manage tenants"
  ON public.tenants FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage providers"
  ON public.providers FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage agents"
  ON public.agents FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage tools"
  ON public.tools FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage agent_tools"
  ON public.agent_tools FOR ALL
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin(auth.uid()));
