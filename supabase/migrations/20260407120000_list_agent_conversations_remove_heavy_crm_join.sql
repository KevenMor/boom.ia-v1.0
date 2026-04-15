-- list_agent_conversations: remove JOIN LATERAL em public.contacts por conversa.
-- O LATERAL com regexp_replace em cada linha + muitos contatos no CRM (ex.: Autoescola Ideal)
-- podia estourar tempo limite ou degradar a RPC a ponto do cliente receber lista vazia / erro.
-- crm_display_name fica NULL na listagem; o nome do contato continua em contact_name / Chatwoot.

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
  chatwoot_contact_id INTEGER,
  labels TEXT[],
  chatwoot_assignee_name TEXT,
  crm_display_name TEXT
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
    $q$
    SELECT c.id, c.channel, c.external_user_id, c.status, c.started_at, c.ended_at,
           (SELECT COUNT(*)::bigint FROM %I.messages m WHERE m.conversation_id = c.id) AS message_count,
           c.contact_name, c.contact_avatar_url,
           c.chatwoot_conversation_id, c.chatwoot_contact_id,
           COALESCE(c.labels, '{}'::text[]) AS labels,
           c.chatwoot_assignee_name,
           NULL::text AS crm_display_name
    FROM %I.conversations c
    WHERE c.agent_id = $1
    ORDER BY (
      SELECT COALESCE(MAX(m.created_at), c.started_at)
      FROM %I.messages m
      WHERE m.conversation_id = c.id
    ) DESC
    LIMIT $2
    $q$,
    v_schema,
    v_schema,
    v_schema
  ) USING p_agent_id, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
