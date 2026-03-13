-- ============================================================
-- Nexus AI — RPC para busca RAG por similaridade
-- Execute no Supabase (SQL Editor ou psql)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rag_search_chunks(
  p_agent_id UUID,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  content TEXT,
  source_url TEXT,
  title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT c.content, d.source_url, d.title
     FROM %I.knowledge_chunks c
     JOIN %I.knowledge_documents d ON d.id = c.document_id
     WHERE d.agent_id = $1 AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> $2
     LIMIT $3',
    v_schema, v_schema
  ) USING p_agent_id, p_query_embedding, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rag_search_chunks(UUID, vector(1536), INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rag_search_chunks(UUID, vector(1536), INT) TO anon;
GRANT EXECUTE ON FUNCTION public.rag_search_chunks(UUID, vector(1536), INT) TO service_role;
