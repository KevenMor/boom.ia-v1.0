-- ============================================================
-- 053 — RPCs de Gerenciamento da Base de Conhecimento de Agentes (RAG)
-- Permite listar e deletar documentos de schemas dinâmicos de tenants
-- Idempotente. Aplicar no schema public do Supabase.
-- ============================================================

-- Listar documentos da base de conhecimento do agente
CREATE OR REPLACE FUNCTION public.list_agent_documents(p_agent_id UUID)
RETURNS TABLE (
  id UUID,
  agent_id UUID,
  title TEXT,
  source_url TEXT,
  file_type TEXT,
  status TEXT,
  chunk_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ
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
    RAISE EXCEPTION 'Tenant schema not found for agent %', p_agent_id;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, agent_id, title, source_url, file_type, status, chunk_count, metadata, created_at 
     FROM %I.knowledge_documents 
     WHERE agent_id = $1 
     ORDER BY created_at DESC',
    v_schema
  ) USING p_agent_id;
END;
$$;

-- Deletar documento da base de conhecimento do agente
CREATE OR REPLACE FUNCTION public.delete_agent_document(p_agent_id UUID, p_document_id UUID)
RETURNS BOOLEAN
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
    RAISE EXCEPTION 'Tenant schema not found for agent %', p_agent_id;
  END IF;

  EXECUTE format(
    'DELETE FROM %I.knowledge_documents WHERE id = $1 AND agent_id = $2',
    v_schema
  ) USING p_document_id, p_agent_id;

  RETURN TRUE;
END;
$$;

-- Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.list_agent_documents(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_agent_document(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- Criação e Políticas RLS do Bucket de Storage (agent-documents)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('agent-documents', 'agent-documents', false, 52428800, '{application/pdf}')
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800, allowed_mime_types = '{application/pdf}';

-- Leitura por utilizadores autenticados (painel)
DROP POLICY IF EXISTS "agent_documents_authenticated_select" ON storage.objects;
CREATE POLICY "agent_documents_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'agent-documents');

-- Upload: utilizadores autenticados (painel)
DROP POLICY IF EXISTS "agent_documents_authenticated_insert" ON storage.objects;
CREATE POLICY "agent_documents_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'agent-documents');

-- Alteração: utilizadores autenticados (painel)
DROP POLICY IF EXISTS "agent_documents_authenticated_update" ON storage.objects;
CREATE POLICY "agent_documents_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'agent-documents')
  WITH CHECK (bucket_id = 'agent-documents');

-- Exclusão: utilizadores autenticados (painel)
DROP POLICY IF EXISTS "agent_documents_authenticated_delete" ON storage.objects;
CREATE POLICY "agent_documents_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'agent-documents');

-- ============================================================
-- Listar chunks de um documento específico
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_document_chunks(p_agent_id UUID, p_document_id UUID)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ
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
    RAISE EXCEPTION 'Tenant schema not found for agent %', p_agent_id;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, document_id, content, chunk_index, metadata, created_at 
     FROM %I.knowledge_chunks 
     WHERE document_id = $1 
     ORDER BY chunk_index ASC',
    v_schema
  ) USING p_document_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_document_chunks(UUID, UUID) TO authenticated, service_role;
