-- Boom IA — Calendário do parque, categorias/unidades de hospedagem e reservas por unidade.
-- Replica de supabase/migrations/20260507120000_lodging_park_calendar_and_reservations.sql — executar no Supabase SQL Editor.
-- Se já executou uma versão antiga deste script (tipos open_* / closed), aplique também sql/019_lodging_park_day_kind_event_label_v2.sql.
-- Para adicionar o campo de valor de ingresso em bases já criadas, aplique sql/020_lodging_park_day_ticket_value.sql.

CREATE OR REPLACE FUNCTION public.lodging_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.lodging_park_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  day_kind TEXT NOT NULL DEFAULT 'aberto'
    CHECK (day_kind IN ('aberto', 'fechado', 'manutencao')),
  lodging_rules TEXT,
  event_label TEXT CHECK (event_label IS NULL OR event_label IN ('promocional', 'evento', 'normal')),
  park_ticket_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS idx_lodging_park_days_tenant_month ON public.lodging_park_days (tenant_id, calendar_date);

CREATE TABLE IF NOT EXISTS public.lodging_accommodation_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_occupancy INTEGER CHECK (max_occupancy IS NULL OR max_occupancy > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lodging_accommodation_types_tenant ON public.lodging_accommodation_types (tenant_id);

CREATE TABLE IF NOT EXISTS public.lodging_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  accommodation_type_id UUID NOT NULL REFERENCES public.lodging_accommodation_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lodging_units_tenant ON public.lodging_units (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lodging_units_type ON public.lodging_units (accommodation_type_id);

CREATE TABLE IF NOT EXISTS public.lodging_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.lodging_units(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_lodging_reservations_tenant_dates ON public.lodging_reservations (tenant_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_lodging_reservations_unit ON public.lodging_reservations (unit_id);

DROP TRIGGER IF EXISTS tr_lodging_park_days_touch ON public.lodging_park_days;
CREATE TRIGGER tr_lodging_park_days_touch BEFORE UPDATE ON public.lodging_park_days FOR EACH ROW EXECUTE FUNCTION public.lodging_touch_updated_at();

DROP TRIGGER IF EXISTS tr_lodging_accommodation_types_touch ON public.lodging_accommodation_types;
CREATE TRIGGER tr_lodging_accommodation_types_touch BEFORE UPDATE ON public.lodging_accommodation_types FOR EACH ROW EXECUTE FUNCTION public.lodging_touch_updated_at();

DROP TRIGGER IF EXISTS tr_lodging_units_touch ON public.lodging_units;
CREATE TRIGGER tr_lodging_units_touch BEFORE UPDATE ON public.lodging_units FOR EACH ROW EXECUTE FUNCTION public.lodging_touch_updated_at();

DROP TRIGGER IF EXISTS tr_lodging_reservations_touch ON public.lodging_reservations;
CREATE TRIGGER tr_lodging_reservations_touch BEFORE UPDATE ON public.lodging_reservations FOR EACH ROW EXECUTE FUNCTION public.lodging_touch_updated_at();

ALTER TABLE public.lodging_park_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lodging_accommodation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lodging_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lodging_reservations ENABLE ROW LEVEL SECURITY;

-- Idempotente: re-execução no SQL Editor não falha com "policy already exists".
DROP POLICY IF EXISTS "service_role_full_lodging_park_days" ON public.lodging_park_days;
CREATE POLICY "service_role_full_lodging_park_days"
  ON public.lodging_park_days FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_full_lodging_accommodation_types" ON public.lodging_accommodation_types;
CREATE POLICY "service_role_full_lodging_accommodation_types"
  ON public.lodging_accommodation_types FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_full_lodging_units" ON public.lodging_units;
CREATE POLICY "service_role_full_lodging_units"
  ON public.lodging_units FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_full_lodging_reservations" ON public.lodging_reservations;
CREATE POLICY "service_role_full_lodging_reservations"
  ON public.lodging_reservations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select_lodging_park_days" ON public.lodging_park_days;
CREATE POLICY "authenticated_select_lodging_park_days"
  ON public.lodging_park_days FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_select_lodging_accommodation_types" ON public.lodging_accommodation_types;
CREATE POLICY "authenticated_select_lodging_accommodation_types"
  ON public.lodging_accommodation_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_select_lodging_units" ON public.lodging_units;
CREATE POLICY "authenticated_select_lodging_units"
  ON public.lodging_units FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated_select_lodging_reservations" ON public.lodging_reservations;
CREATE POLICY "authenticated_select_lodging_reservations"
  ON public.lodging_reservations FOR SELECT TO authenticated USING (true);
