-- Add metadata column to tenant messages for debug/token_usage (Chat ao Vivo)
-- Run after 004_conversation_memory / provisioned tenants exist

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''',
      r.db_name
    );
  END LOOP;
END $$;

-- save_message: add optional p_metadata
CREATE OR REPLACE FUNCTION public.save_message(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_model TEXT DEFAULT NULL,
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
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

  IF p_metadata IS NOT NULL THEN
    EXECUTE format(
      'INSERT INTO %I.messages (conversation_id, role, content, model, tokens_input, tokens_output, latency_ms, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      v_schema
    ) INTO v_msg_id USING p_conversation_id, p_role, p_content, p_model, p_tokens_input, p_tokens_output, p_latency_ms, p_metadata;
  ELSE
    EXECUTE format(
      'INSERT INTO %I.messages (conversation_id, role, content, model, tokens_input, tokens_output, latency_ms) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      v_schema
    ) INTO v_msg_id USING p_conversation_id, p_role, p_content, p_model, p_tokens_input, p_tokens_output, p_latency_ms;
  END IF;

  RETURN v_msg_id;
END;
$$;

-- load_conversation_messages: return metadata
CREATE OR REPLACE FUNCTION public.load_conversation_messages(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS TABLE(id UUID, role TEXT, content TEXT, model TEXT, tokens_input INTEGER, tokens_output INTEGER, latency_ms INTEGER, created_at TIMESTAMPTZ, metadata JSONB)
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
    'SELECT m.id, m.role, m.content, m.model, m.tokens_input, m.tokens_output, m.latency_ms, m.created_at, COALESCE(m.metadata, ''{}''::jsonb) FROM %I.messages m WHERE m.conversation_id = $1 ORDER BY m.created_at ASC',
    v_schema
  ) USING p_conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_message(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated;
