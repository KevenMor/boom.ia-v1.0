-- Migration 027: Add omnibees_room mapping to suite_galleries
-- Permite vincular galerias de suítes aos nomes retornados pela Omnibees
-- para anexar foto cover automaticamente nas cotações

ALTER TABLE public.suite_galleries
  ADD COLUMN IF NOT EXISTS omnibees_room text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_suite_galleries_omnibees_room
  ON public.suite_galleries USING gin(omnibees_room);

COMMENT ON COLUMN public.suite_galleries.omnibees_room IS
  'Nomes retornados pela Omnibees que mapeiam para esta galeria. Usado para anexar cover_image_url na cotação. Pode ter múltiplos aliases (ex.: ["Suíte Vip", "Suite Vip Premium"]).';
