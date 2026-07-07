-- ============================================================
-- 039 — Gestão de lotes (empreendimentos + lotes) por tenant
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lot_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.lot_developments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  city TEXT,
  state TEXT,
  address TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  map_image_url TEXT,
  map_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lot_developments_tenant ON public.lot_developments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lot_developments_tenant_status ON public.lot_developments (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  development_id UUID NOT NULL REFERENCES public.lot_developments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  block TEXT,
  lot_number TEXT,
  area_m2 NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'blocked')),
  list_price NUMERIC(14, 2),
  map_geometry JSONB,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  reserved_at TIMESTAMPTZ,
  reserved_until TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (development_id, code)
);

CREATE INDEX IF NOT EXISTS idx_lots_tenant ON public.lots (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lots_development ON public.lots (development_id);
CREATE INDEX IF NOT EXISTS idx_lots_development_status ON public.lots (development_id, status);
CREATE INDEX IF NOT EXISTS idx_lots_contact ON public.lots (contact_id);

DROP TRIGGER IF EXISTS tr_lot_developments_touch ON public.lot_developments;
CREATE TRIGGER tr_lot_developments_touch
  BEFORE UPDATE ON public.lot_developments
  FOR EACH ROW EXECUTE FUNCTION public.lot_touch_updated_at();

DROP TRIGGER IF EXISTS tr_lots_touch ON public.lots;
CREATE TRIGGER tr_lots_touch
  BEFORE UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.lot_touch_updated_at();

ALTER TABLE public.lot_developments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_lot_developments" ON public.lot_developments;
CREATE POLICY "service_role_full_lot_developments"
  ON public.lot_developments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full_lots" ON public.lots;
CREATE POLICY "service_role_full_lots"
  ON public.lots FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_lot_developments" ON public.lot_developments;
CREATE POLICY "authenticated_select_lot_developments"
  ON public.lot_developments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_lots" ON public.lots;
CREATE POLICY "authenticated_select_lots"
  ON public.lots FOR SELECT TO authenticated USING (true);
