CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view tenant modules" ON public.tenant_modules;
CREATE POLICY "Authenticated users can view tenant modules"
  ON public.tenant_modules
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed inicial: inventário habilitado para a PPL Motors.
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
VALUES ('bc4a1dc9-a205-4b4b-9b6c-47bf677a2728', 'inventory', true)
ON CONFLICT (tenant_id, module_key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now();
