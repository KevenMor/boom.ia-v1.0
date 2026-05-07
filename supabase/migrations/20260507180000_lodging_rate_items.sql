-- Boom IA — Tabela de valores de hospedagem (tarifas por acomodação, pessoas, noites).
-- Replica: sql/023_lodging_rate_items.sql
-- Executar no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.lodging_rate_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  accommodation_type_id UUID NOT NULL REFERENCES public.lodging_accommodation_types(id) ON DELETE CASCADE,
  guests INTEGER NOT NULL CHECK (guests > 0),
  nights INTEGER NOT NULL CHECK (nights > 0),
  price DECIMAL(12, 2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  valid_from DATE,
  valid_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, accommodation_type_id, guests, nights, valid_from, valid_to)
);

CREATE INDEX IF NOT EXISTS idx_lodging_rate_items_tenant ON public.lodging_rate_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lodging_rate_items_type ON public.lodging_rate_items (accommodation_type_id);
CREATE INDEX IF NOT EXISTS idx_lodging_rate_items_search ON public.lodging_rate_items (tenant_id, accommodation_type_id, guests, nights);

DROP TRIGGER IF EXISTS tr_lodging_rate_items_touch ON public.lodging_rate_items;
CREATE TRIGGER tr_lodging_rate_items_touch BEFORE UPDATE ON public.lodging_rate_items
  FOR EACH ROW EXECUTE FUNCTION public.lodging_touch_updated_at();

ALTER TABLE public.lodging_rate_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_lodging_rate_items" ON public.lodging_rate_items;
CREATE POLICY "service_role_full_lodging_rate_items"
  ON public.lodging_rate_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_lodging_rate_items" ON public.lodging_rate_items;
CREATE POLICY "authenticated_select_lodging_rate_items"
  ON public.lodging_rate_items FOR SELECT TO authenticated USING (true);
