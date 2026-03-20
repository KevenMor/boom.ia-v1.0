-- Coluna video_details na tabela inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS video_details TEXT;
COMMENT ON COLUMN public.inventory.video_details IS 'URL do vídeo detalhado do veículo (Supabase Storage)';

-- Bucket para vídeos de inventário
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-videos', 'inventory-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage (remover se existirem para idempotência)
DROP POLICY IF EXISTS "Public read inventory-videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload inventory-videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update inventory-videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete inventory-videos" ON storage.objects;

CREATE POLICY "Public read inventory-videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inventory-videos');

CREATE POLICY "Authenticated upload inventory-videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'inventory-videos');

CREATE POLICY "Authenticated update inventory-videos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'inventory-videos');

CREATE POLICY "Authenticated delete inventory-videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'inventory-videos');
