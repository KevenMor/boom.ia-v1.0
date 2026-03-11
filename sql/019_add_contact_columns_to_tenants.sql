-- Adiciona contact_name e contact_avatar_url em schemas de tenants que não têm
-- Corrige erro: column "contact_name" of relation "conversations" does not exist

-- 1. Adicionar colunas em tenants já provisionados
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

-- 2. Garantir que create_conversation e list_agent_conversations existam com suporte a contact_name
-- (caso 008 não tenha sido executado)
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

GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
