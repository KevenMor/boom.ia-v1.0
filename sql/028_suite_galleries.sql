-- ============================================================
-- Boom IA — Galeria (mídia por tenant; nome livre)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suite_galleries (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  media_urls      JSONB       NOT NULL DEFAULT '[]',
  display_order   INTEGER     NOT NULL DEFAULT 0,
  llm_media_guidance TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.suite_galleries.media_urls IS
  'Array of {url: string, type: "photo"|"video", caption?: string}';

CREATE INDEX IF NOT EXISTS idx_suite_galleries_tenant
  ON public.suite_galleries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_suite_galleries_order
  ON public.suite_galleries(tenant_id, display_order);

-- RLS
ALTER TABLE public.suite_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suite_galleries"
  ON public.suite_galleries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage suite_galleries"
  ON public.suite_galleries FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can view suite_galleries"
  ON public.suite_galleries FOR SELECT TO anon USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_suite_galleries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_suite_galleries_updated_at
  BEFORE UPDATE ON public.suite_galleries
  FOR EACH ROW EXECUTE FUNCTION public.update_suite_galleries_updated_at();

-- ============================================================
-- Storage bucket suite-galleries
-- ============================================================
-- Aplicar no projeto: supabase db push (migration 20260420120000_suite_galleries_storage_bucket.sql)
-- ou colar no SQL Editor o conteúdo desse ficheiro em supabase/migrations/.
