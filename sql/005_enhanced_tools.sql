-- ============================================================
-- Nexus AI — Enhanced Tools with Function Calling
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- Adiciona suporte a tenant_id, tool_type e execution_config
-- ============================================================

-- 1. Add tenant_id to tools (NULL = global tool)
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2. Replace generic 'type' with specific tool_type
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS tool_type TEXT NOT NULL DEFAULT 'api_rest'
  CHECK (tool_type IN ('sql_query', 'web_scraper', 'api_rest', 'rag_search'));

-- 3. Add execution_config for type-specific settings
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS execution_config JSONB DEFAULT '{}';

-- 4. Add function_def for OpenAI-compatible function definition (parameters schema)
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS function_def JSONB DEFAULT '{}';

-- 5. Index for tenant lookup
CREATE INDEX IF NOT EXISTS idx_tools_tenant ON public.tools(tenant_id);

-- 6. RPC: Load tools for an agent (global + tenant tools bound via agent_tools)
CREATE OR REPLACE FUNCTION public.load_agent_tools(p_agent_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  tool_type TEXT,
  function_def JSONB,
  execution_config JSONB,
  endpoint TEXT,
  auth_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.description, t.tool_type, t.function_def, t.execution_config, t.endpoint, t.auth_config
  FROM public.tools t
  INNER JOIN public.agent_tools at ON at.tool_id = t.id
  WHERE at.agent_id = p_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.load_agent_tools(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_agent_tools(UUID) TO anon;

-- ============================================================
-- EXAMPLE: How to create a tool with function calling
-- ============================================================
-- INSERT INTO public.tools (name, description, tool_type, tenant_id, function_def, execution_config)
-- VALUES (
--   'consultar_pedidos',
--   'Consulta pedidos do cliente no banco de dados',
--   'sql_query',
--   '<tenant_uuid>',
--   '{
--     "name": "consultar_pedidos",
--     "description": "Busca pedidos de um cliente pelo email ou número do pedido",
--     "parameters": {
--       "type": "object",
--       "properties": {
--         "email": { "type": "string", "description": "Email do cliente" },
--         "order_id": { "type": "string", "description": "Número do pedido" }
--       },
--       "required": []
--     }
--   }',
--   '{
--     "query_template": "SELECT id, status, total, created_at FROM orders WHERE (email = $1 OR $1 IS NULL) AND (order_number = $2 OR $2 IS NULL) LIMIT 10",
--     "param_mapping": ["email", "order_id"]
--   }'
-- );
