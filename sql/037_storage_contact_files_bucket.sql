-- ============================================================
-- Boom IA — Storage: arquivos de clientes (contact_documents)
-- Execute no MESMO projeto Supabase de NEXUS_DB_URL
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('contact-files', 'contact-files', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

DROP POLICY IF EXISTS "contact_files_public_select" ON storage.objects;
CREATE POLICY "contact_files_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contact-files');

DROP POLICY IF EXISTS "contact_files_authenticated_insert" ON storage.objects;
CREATE POLICY "contact_files_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contact-files');

DROP POLICY IF EXISTS "contact_files_authenticated_update" ON storage.objects;
CREATE POLICY "contact_files_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'contact-files')
  WITH CHECK (bucket_id = 'contact-files');

DROP POLICY IF EXISTS "contact_files_authenticated_delete" ON storage.objects;
CREATE POLICY "contact_files_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contact-files');
