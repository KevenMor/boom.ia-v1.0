-- Enriquece list_agent_conversations com nome do CRM (public.contacts) por telefone normalizado

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
  v_tenant_id UUID;
BEGIN
  SELECT t.id, t.db_name INTO v_tenant_id, v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL OR v_tenant_id IS NULL THEN
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
           crm.crm_display_name
    FROM %I.conversations c
    LEFT JOIN LATERAL (
      SELECT ct.name AS crm_display_name
      FROM public.contacts ct
      WHERE ct.tenant_id = $3
        AND ct.phone IS NOT NULL
        AND length(trim(ct.phone)) > 0
        AND (
          regexp_replace(coalesce(c.external_user_id, ''), '\D', '', 'g') = regexp_replace(ct.phone, '\D', '', 'g')
          OR (
            length(regexp_replace(coalesce(c.external_user_id, ''), '\D', '', 'g')) >= 10
            AND length(regexp_replace(ct.phone, '\D', '', 'g')) >= 10
            AND right(regexp_replace(coalesce(c.external_user_id, ''), '\D', '', 'g'), 11)
                = right(regexp_replace(ct.phone, '\D', '', 'g'), 11)
          )
        )
      ORDER BY ct.updated_at DESC NULLS LAST
      LIMIT 1
    ) crm ON true
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
  ) USING p_agent_id, p_limit, v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
