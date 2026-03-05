-- ============================================================
-- Nexus AI — Add chatwoot_assign and send_notification tool types
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- ============================================================

ALTER TABLE public.tools
  DROP CONSTRAINT IF EXISTS tools_tool_type_check;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_tool_type_check
  CHECK (tool_type IN (
    'sql_query', 'web_scraper', 'api_rest', 'rag_search',
    'inventory_query', 'nearest_unit', 'fipe_query',
    'calendar_query', 'chatwoot_assign', 'send_notification'
  ));
