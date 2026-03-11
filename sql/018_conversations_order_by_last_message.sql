-- Ordena conversas por última mensagem (estilo WhatsApp) em vez de started_at
-- Contatos com mensagem nova aparecem primeiro na lista do Chat ao Vivo
-- Aplicar manualmente se as migrações Supabase não forem usadas
--
-- Pré-requisito: sql/009_chatwoot_dedup_and_contact.sql deve ter sido aplicado
-- (conversations precisa ter chatwoot_conversation_id e chatwoot_contact_id)

DROP FUNCTION IF EXISTS public.list_agent_conversations(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.list_agent_conversations(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  channel TEXT,
  external_user_id TEXT,
  status TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  message_count BIGINT,
  contact_name TEXT,
  contact_avatar_url TEXT,
  chatwoot_conversation_id INTEGER,
  chatwoot_contact_id INTEGER
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
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT c.id, c.channel, c.external_user_id, c.status, c.started_at, c.ended_at,
            (SELECT COUNT(*) FROM %I.messages m WHERE m.conversation_id = c.id) as message_count,
            c.contact_name, c.contact_avatar_url,
            c.chatwoot_conversation_id, c.chatwoot_contact_id
     FROM %I.conversations c
     WHERE c.agent_id = $1
     ORDER BY (SELECT COALESCE(MAX(m.created_at), c.started_at) FROM %I.messages m WHERE m.conversation_id = c.id) DESC
     LIMIT $2',
    v_schema, v_schema, v_schema
  ) USING p_agent_id, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
