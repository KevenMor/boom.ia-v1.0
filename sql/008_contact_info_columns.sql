-- ============================================================
-- Nexus AI — Add contact_name & contact_avatar_url to conversations
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- Adiciona colunas de info de contato + atualiza RPCs
-- ============================================================

-- 1. Adicionar colunas nos schemas de tenants existentes
-- Execute para CADA tenant provisionado (troque dp_SLUG pelo schema real)
-- Exemplo: ALTER TABLE dp_meu_tenant.conversations ADD COLUMN ...

-- Helper: aplica em TODOS os schemas dp_* de uma vez
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS contact_name TEXT',
      rec.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT',
      rec.db_name
    );
  END LOOP;
END;
$$;

-- 2. Atualizar provision_tenant_schema para incluir as novas colunas em novos tenants
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
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_chunks_embedding ON %I.knowledge_chunks USING hnsw (embedding vector_cosine_ops)', replace(v_slug, '-', '_'), v_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_usage_agent ON %I.usage_daily(agent_id, date)', replace(v_slug, '-', '_'), v_schema);

  UPDATE public.tenants
  SET status = 'active',
      db_name = v_schema,
      updated_at = now()
  WHERE id = p_tenant_id;

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

-- 3. Atualizar create_conversation para aceitar nome e avatar
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_agent_id UUID,
  p_channel TEXT DEFAULT 'sandbox',
  p_external_user_id TEXT DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_avatar_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
  v_conv_id UUID;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  EXECUTE format(
    'INSERT INTO %I.conversations (agent_id, channel, external_user_id, contact_name, contact_avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    v_schema
  ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id, p_contact_name, p_contact_avatar_url;

  RETURN v_conv_id;
END;
$$;

-- 4. Criar função para atualizar info de contato numa conversa existente
CREATE OR REPLACE FUNCTION public.update_conversation_contact(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_avatar_url TEXT DEFAULT NULL
)
RETURNS VOID
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

  IF v_schema IS NULL THEN RETURN; END IF;

  EXECUTE format(
    'UPDATE %I.conversations SET contact_name = COALESCE($2, contact_name), contact_avatar_url = COALESCE($3, contact_avatar_url) WHERE id = $1',
    v_schema
  ) USING p_conversation_id, p_contact_name, p_contact_avatar_url;
END;
$$;

-- 5. Atualizar list_agent_conversations para retornar nome e avatar
-- Precisa dropar primeiro pois mudou o tipo de retorno (novas colunas OUT)
DROP FUNCTION IF EXISTS public.list_agent_conversations(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.list_agent_conversations(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(id UUID, channel TEXT, external_user_id TEXT, contact_name TEXT, contact_avatar_url TEXT, status TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, message_count BIGINT)
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
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT c.id, c.channel, c.external_user_id, c.contact_name, c.contact_avatar_url, c.status, c.started_at, c.ended_at,
            (SELECT COUNT(*) FROM %I.messages m WHERE m.conversation_id = c.id) as message_count
     FROM %I.conversations c
     WHERE c.agent_id = $1
     ORDER BY c.started_at DESC
     LIMIT $2',
    v_schema, v_schema
  ) USING p_agent_id, p_limit;
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_conversation_contact(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
