-- ============================================================
-- Nexus AI — Conversation Memory Functions
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- Gerencia conversas e mensagens nos schemas dos tenants
-- ============================================================

-- Criar conversa no schema do tenant
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_agent_id UUID,
  p_channel TEXT DEFAULT 'sandbox',
  p_external_user_id TEXT DEFAULT NULL
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
    'INSERT INTO %I.conversations (agent_id, channel, external_user_id) VALUES ($1, $2, $3) RETURNING id',
    v_schema
  ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id;

  RETURN v_conv_id;
END;
$$;

-- Salvar mensagem no schema do tenant
CREATE OR REPLACE FUNCTION public.save_message(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_model TEXT DEFAULT NULL,
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
  v_msg_id UUID;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  EXECUTE format(
    'INSERT INTO %I.messages (conversation_id, role, content, model, tokens_input, tokens_output, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    v_schema
  ) INTO v_msg_id USING p_conversation_id, p_role, p_content, p_model, p_tokens_input, p_tokens_output, p_latency_ms;

  RETURN v_msg_id;
END;
$$;

-- Carregar mensagens de uma conversa
CREATE OR REPLACE FUNCTION public.load_conversation_messages(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS TABLE(id UUID, role TEXT, content TEXT, model TEXT, tokens_input INTEGER, tokens_output INTEGER, latency_ms INTEGER, created_at TIMESTAMPTZ)
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
    'SELECT m.id, m.role, m.content, m.model, m.tokens_input, m.tokens_output, m.latency_ms, m.created_at FROM %I.messages m WHERE m.conversation_id = $1 ORDER BY m.created_at ASC',
    v_schema
  ) USING p_conversation_id;
END;
$$;

-- Listar conversas de um agente
CREATE OR REPLACE FUNCTION public.list_agent_conversations(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(id UUID, channel TEXT, external_user_id TEXT, status TEXT, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, message_count BIGINT)
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
    'SELECT c.id, c.channel, c.external_user_id, c.status, c.started_at, c.ended_at,
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
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_message(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_conversation_messages(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
