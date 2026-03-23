DROP POLICY IF EXISTS "Authenticated users can upsert tenant modules" ON public.tenant_modules;
CREATE POLICY "Authenticated users can upsert tenant modules"
  ON public.tenant_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update tenant modules" ON public.tenant_modules;
CREATE POLICY "Authenticated users can update tenant modules"
  ON public.tenant_modules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
