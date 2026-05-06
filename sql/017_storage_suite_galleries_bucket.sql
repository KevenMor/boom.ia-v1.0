-- ============================================================
-- Boom IA — Storage: bucket da Galeria (suite_galleries no painel)
-- Execute no MESMO projeto Supabase de NEXUS_DB_URL (SQL Editor).
--
-- Sintomas sem este bucket: upload JPEG/MP4 com HTTP 404; miniaturas 404
-- em .../storage/v1/object/public/suite-galleries/...
-- ============================================================

-- file_size_limit (ex.: 209715200 = 200 MB) pode ajustar no Dashboard → Storage → bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('suite-galleries', 'suite-galleries', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (URLs getPublicUrl / proxy GET)
DROP POLICY IF EXISTS "suite_galleries_public_select" ON storage.objects;
CREATE POLICY "suite_galleries_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'suite-galleries');

-- Upload / alteração / exclusão: utilizadores com sessão (painel)
DROP POLICY IF EXISTS "suite_galleries_authenticated_insert" ON storage.objects;
CREATE POLICY "suite_galleries_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'suite-galleries');

DROP POLICY IF EXISTS "suite_galleries_authenticated_update" ON storage.objects;
CREATE POLICY "suite_galleries_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'suite-galleries')
  WITH CHECK (bucket_id = 'suite-galleries');

DROP POLICY IF EXISTS "suite_galleries_authenticated_delete" ON storage.objects;
CREATE POLICY "suite_galleries_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'suite-galleries');
