-- Add calendar_query to allowed tool types
ALTER TABLE public.tools DROP CONSTRAINT IF EXISTS tools_tool_type_check;
ALTER TABLE public.tools ADD CONSTRAINT tools_tool_type_check
  CHECK (tool_type IN ('sql_query', 'web_scraper', 'api_rest', 'rag_search', 'inventory_query', 'nearest_unit', 'fipe_query', 'calendar_query'));
