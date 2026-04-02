-- ============================================================
-- Nexus AI — Corrige coluna metadata ausente em mensagens
-- Pré-requisito: sql/026_provision_tenant_labels.sql
--
-- Problema: sql/026 atualizou provision_tenant_schema mas removeu
-- acidentalmente a coluna `metadata` da tabela messages. Tenants
-- criados após o 026 não têm essa coluna, causando falha na RPC
-- load_conversation_messages com "column m.metadata does not exist".
--
-- Este script:
-- 1. Adiciona metadata a todos os schemas de tenant existentes
-- 2. Corrige provision_tenant_schema para incluir a coluna daqui em diante
-- ============================================================

-- 1. Adicionar coluna metadata nas tabelas messages de todos os tenants existentes
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''',
      rec.db_name
    );
  END LOOP;
END;
$$;

-- 2. Corrigir provision_tenant_schema para incluir metadata nos tenants futuros
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
  SELECT slug INTO v_slug FROM public.tenants WHERE id = p_tenant_id;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant % não encontrado', p_tenant_id;
  END IF;

  v_schema := 'dp_' || replace(v_slug, '-', '_');

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
      external_user_id TEXT,
      contact_name TEXT,
      contact_avatar_url TEXT,
      channel TEXT NOT NULL DEFAULT ''api'',
      metadata JSONB DEFAULT ''{}'',
      status TEXT NOT NULL DEFAULT ''open'',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema);

  -- Colunas adicionadas por migrações posteriores (009, 025)
  EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER', v_schema);
  EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_contact_id INTEGER', v_schema);
  EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT ''{}''', v_schema);

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
      metadata JSONB DEFAULT ''{}'',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  ', v_schema, v_schema);

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

  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_conv_agent ON %I.conversations(agent_id)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_msg_conv ON %I.messages(conversation_id)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_msg_created ON %I.messages(created_at DESC)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chunks_doc ON %I.knowledge_chunks(document_id)', replace(v_slug, '-', '_'), v_schema);
  BEGIN
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chunks_embedding ON %I.knowledge_chunks USING hnsw (embedding vector_cosine_ops)', replace(v_slug, '-', '_'), v_schema);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_usage_agent ON %I.usage_daily(agent_id, date)', replace(v_slug, '-', '_'), v_schema);

  UPDATE public.tenants
  SET status = 'active',
      db_name = v_schema,
      updated_at = now()
  WHERE id = p_tenant_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULLIF(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    'tenant.provisioned',
    'tenant',
    p_tenant_id,
    jsonb_build_object('schema', v_schema, 'tables', ARRAY['conversations', 'messages', 'knowledge_documents', 'knowledge_chunks', 'usage_daily'])
  );
END;
$$;
