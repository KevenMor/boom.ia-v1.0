-- ============================================================
-- 017 — Provisionar tenants sem schema (db_name NULL)
-- Execute manualmente no SQL Editor para corrigir tenants que
-- foram criados sem provisionamento (ex.: import, migração).
-- ============================================================
-- Uso: rode este script e depois, para cada tenant listado,
-- execute: SELECT provision_tenant_schema(id) FROM tenants WHERE db_name IS NULL;

-- Listar tenants que precisam de provisionamento
SELECT id, name, slug, status, db_name, created_at
FROM public.tenants
WHERE db_name IS NULL
ORDER BY created_at DESC;

-- Para provisionar todos de uma vez (descomente e execute):
/*
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE db_name IS NULL
  LOOP
    BEGIN
      PERFORM public.provision_tenant_schema(r.id);
      RAISE NOTICE 'Provisionado tenant %', r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha ao provisionar tenant %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
*/
