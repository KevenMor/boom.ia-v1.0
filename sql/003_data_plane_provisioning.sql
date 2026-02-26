-- ============================================================
-- Nexus AI — Data Plane Provisioning
-- Execute no seu Supabase self-hosted (SQL Editor ou psql)
-- ============================================================

-- Função que cria o schema de Data Plane para um tenant
-- Cada tenant recebe um schema isolado com tabelas de conversas,
-- mensagens, base de conhecimento, etc.

CREATE OR REPLACE FUNCTION public.provision_tenant_schema(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
  v_schema TEXT;
BEGIN
  -- Busca slug do tenant
  SELECT slug INTO v_slug FROM public.tenants WHERE id = p_tenant_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant % não encontrado', p_tenant_id;
  END IF;

  -- Nome do schema: dp_{slug} (data plane)
  v_schema := 'dp_' || replace(v_slug, '-', '_');

  -- Cria o schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  -- ===== Tabelas do Data Plane =====

  -- 1. Conversations
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
      external_user_id TEXT,
      channel TEXT NOT NULL DEFAULT ''api'',
      metadata JSONB DEFAULT ''{}'',
      status TEXT NOT NULL DEFAULT ''open'',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema);

  -- 2. Messages
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES %I.conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN (''user'', ''assistant'', ''system'', ''tool'')),
      content TEXT,
      tool_calls JSONB,
      tool_results JSONB,
      tokens_input INTEGER DEFAULT 0,
      tokens_output INTEGER DEFAULT 0,
      latency_ms INTEGER,
      model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema, v_schema);

  -- 3. Knowledge Base (documentos/chunks para RAG)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.knowledge_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_url TEXT,
      file_type TEXT,
      status TEXT NOT NULL DEFAULT ''processing'',
      chunk_count INTEGER DEFAULT 0,
      metadata JSONB DEFAULT ''{}'',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema);

  -- 4. Knowledge Chunks (vetores para busca semântica)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.knowledge_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES %I.knowledge_documents(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding vector(1536),
      chunk_index INTEGER NOT NULL DEFAULT 0,
      metadata JSONB DEFAULT ''{}'',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema, v_schema);

  -- 5. Usage / Billing Metrics
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.usage_daily (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      messages_count INTEGER DEFAULT 0,
      tokens_input_total BIGINT DEFAULT 0,
      tokens_output_total BIGINT DEFAULT 0,
      cost_usd NUMERIC(10,6) DEFAULT 0,
      UNIQUE(agent_id, date)
    )
  ', v_schema);

  -- ===== Índices =====
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_conv_agent ON %I.conversations(agent_id)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_msg_conv ON %I.messages(conversation_id)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_msg_created ON %I.messages(created_at DESC)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chunks_doc ON %I.knowledge_chunks(document_id)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_usage_agent ON %I.usage_daily(agent_id, date)', replace(v_slug, '-', '_'), v_schema);

  -- ===== RLS nas tabelas do Data Plane =====
  -- Como são schemas isolados, o acesso é controlado pelo Control Plane
  -- As tabelas herdam a segurança do schema

  -- Atualiza o tenant com status ativo
  UPDATE public.tenants
  SET status = 'active',
      db_name = v_schema,
      updated_at = now()
  WHERE id = p_tenant_id;

  -- Registra no audit log
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'tenant.provisioned',
    'tenant',
    p_tenant_id,
    jsonb_build_object('schema', v_schema, 'tables', ARRAY['conversations', 'messages', 'knowledge_documents', 'knowledge_chunks', 'usage_daily'])
  );
END;
$$;

-- Função para remover o schema de um tenant (cleanup)
CREATE OR REPLACE FUNCTION public.deprovision_tenant_schema(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT db_name INTO v_schema FROM public.tenants WHERE id = p_tenant_id;
  IF v_schema IS NULL THEN
    RETURN; -- nada a fazer
  END IF;

  -- Remove o schema inteiro com CASCADE
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema);

  -- Atualiza o tenant
  UPDATE public.tenants
  SET status = 'suspended',
      db_name = NULL,
      updated_at = now()
  WHERE id = p_tenant_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'tenant.deprovisioned',
    'tenant',
    p_tenant_id,
    jsonb_build_object('schema', v_schema)
  );
END;
$$;

-- Grants: apenas admins autenticados podem chamar
REVOKE ALL ON FUNCTION public.provision_tenant_schema(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant_schema(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.deprovision_tenant_schema(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deprovision_tenant_schema(UUID) TO authenticated;
