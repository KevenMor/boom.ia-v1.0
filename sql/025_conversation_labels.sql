-- Nexus AI — Coluna labels em conversations + list_agent_conversations
-- Etiquetas de lead (leadsDD-MM-YYYY) aplicadas pelo marcar_lead
--
-- Pré-requisito: sql/018_conversations_order_by_last_message.sql

-- 1. Adicionar coluna labels nos schemas de tenant existentes
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT ''{}''',
      rec.db_name
    );
  END LOOP;
END;
$$;

-- 2. Garantir labels em tenants provisionados após esta migration (provision já criou a tabela)
-- O trigger provision_tenant_schema cria a tabela; o ALTER acima cobre tenants existentes.
-- Novos tenants: a coluna será adicionada na próxima execução do ALTER (rodar 025 novamente)
-- ou adicionar ao provision_tenant_schema em migração futura.

-- 3. RPC para adicionar label à conversa (usado pelo tool-executor)
CREATE OR REPLACE FUNCTION public.append_conversation_label(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_label TEXT
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

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  EXECUTE format(
    'UPDATE %I.conversations SET labels = array_append(COALESCE(labels, ''{}''), $1)
     WHERE id = $2 AND agent_id = $3 AND (NOT ($1 = ANY(COALESCE(labels, ''{}''))))',
    v_schema
  ) USING p_label, p_conversation_id, p_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_conversation_label(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_conversation_label(UUID, UUID, TEXT) TO service_role;

-- 4. Atualizar list_agent_conversations para retornar labels
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
  labels TEXT[]
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
            c.chatwoot_conversation_id, c.chatwoot_contact_id,
            COALESCE(c.labels, ''{}'') as labels
     FROM %I.conversations c
     WHERE c.agent_id = $1
     ORDER BY (SELECT COALESCE(MAX(m.created_at), c.started_at) FROM %I.messages m WHERE m.conversation_id = c.id) DESC
     LIMIT $2',
    v_schema, v_schema, v_schema
  ) USING p_agent_id, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
