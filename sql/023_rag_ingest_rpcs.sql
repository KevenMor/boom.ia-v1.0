-- ============================================================
-- Nexus AI — RPCs para ingestão RAG via API Supabase (sem conexão Postgres direta)
-- Execute no Supabase SQL Editor
-- Permite ingest via Supabase client quando DATABASE_URL não funciona
-- ============================================================

-- 1. Deletar documento existente por agent_id e source_url
CREATE OR REPLACE FUNCTION public.rag_ingest_delete_document(
  p_schema TEXT,
  p_agent_id UUID,
  p_source_url TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id UUID;
BEGIN
  EXECUTE format(
    'SELECT id FROM %I.knowledge_documents WHERE agent_id = $1 AND source_url = $2 LIMIT 1',
    p_schema
  ) INTO v_doc_id USING p_agent_id, p_source_url;
  IF v_doc_id IS NOT NULL THEN
    EXECUTE format('DELETE FROM %I.knowledge_chunks WHERE document_id = $1', p_schema) USING v_doc_id;
    EXECUTE format('DELETE FROM %I.knowledge_documents WHERE id = $1', p_schema) USING v_doc_id;
  END IF;
END;
$$;

-- 2. Inserir documento e retornar id
CREATE OR REPLACE FUNCTION public.rag_ingest_insert_document(
  p_schema TEXT,
  p_agent_id UUID,
  p_title TEXT,
  p_source_url TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  EXECUTE format(
    'INSERT INTO %I.knowledge_documents (agent_id, title, source_url, file_type, status, chunk_count, metadata)
     VALUES ($1, $2, $3, ''web'', ''processing'', 0, $4)
     RETURNING id',
    p_schema
  ) INTO v_id USING p_agent_id, p_title, p_source_url, p_metadata;
  RETURN v_id;
END;
$$;

-- 3. Inserir chunk com embedding (embedding como texto '[0.1,0.2,...]')
CREATE OR REPLACE FUNCTION public.rag_ingest_insert_chunk(
  p_schema TEXT,
  p_document_id UUID,
  p_content TEXT,
  p_embedding TEXT,
  p_chunk_index INT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO %I.knowledge_chunks (document_id, content, embedding, chunk_index, metadata)
     VALUES ($1, $2, $3::vector, $4, $5)',
    p_schema
  ) USING p_document_id, p_content, p_embedding, p_chunk_index, p_metadata;
END;
$$;

-- 4. Atualizar status do documento
CREATE OR REPLACE FUNCTION public.rag_ingest_update_document_status(
  p_schema TEXT,
  p_document_id UUID,
  p_chunk_count INT,
  p_status TEXT DEFAULT 'ready'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I.knowledge_documents SET status = $1, chunk_count = $2 WHERE id = $3',
    p_schema
  ) USING p_status, p_chunk_count, p_document_id;
END;
$$;
