-- ============================================================
-- 046 — Ownership de agenda por usuário (corretor)
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendars_tenant_owner
  ON public.calendars (tenant_id, owner_user_id);

COMMENT ON COLUMN public.calendars.owner_user_id IS
  'Usuário dono da agenda (ex.: corretor). NULL = agenda compartilhada do tenant (visível a admins).';
