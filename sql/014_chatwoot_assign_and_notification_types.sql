-- ============================================================
-- Nexus AI — Add chatwoot_assign and send_notification tool types
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- ============================================================

-- Drop ALL check constraints on tool_type (including inline-generated ones)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'tools'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tool_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.tools DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_tool_type_check
  CHECK (tool_type IN (
    'sql_query', 'web_scraper', 'api_rest', 'rag_search',
    'inventory_query', 'nearest_unit', 'fipe_query',
    'calendar_query', 'chatwoot_assign', 'send_notification'
  ));
