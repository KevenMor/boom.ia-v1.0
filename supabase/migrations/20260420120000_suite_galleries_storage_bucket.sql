-- Bucket Supabase Storage para fotos/vídeos da Galeria (SuiteGalleryMediaUpload).
INSERT INTO storage.buckets (id, name, public)
VALUES ('suite-galleries', 'suite-galleries', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read suite-galleries" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload suite-galleries" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update suite-galleries" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete suite-galleries" ON storage.objects;

CREATE POLICY "Public read suite-galleries"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'suite-galleries');

CREATE POLICY "Authenticated upload suite-galleries"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'suite-galleries');

CREATE POLICY "Authenticated update suite-galleries"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'suite-galleries');

CREATE POLICY "Authenticated delete suite-galleries"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'suite-galleries');
