-- ============================================================
-- Nexus AI — Chatwoot Deduplication & Contact Tracking
-- Execute no Supabase self-hosted (SQL Editor ou psql)
-- Adiciona chatwoot_conversation_id + chatwoot_contact_id
-- para evitar duplicação de conversas por cliente
-- ============================================================

-- 1) Adicionar colunas de dedup no schema do tenant
-- Execute para CADA tenant provisionado (troque dp_xxx pelo schema correto)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER', rec.db_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_contact_id INTEGER', rec.db_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_conv_cw_id ON %I.conversations(chatwoot_conversation_id) WHERE chatwoot_conversation_id IS NOT NULL',
      replace(rec.db_name, 'dp_', ''), rec.db_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_conv_cw_contact ON %I.conversations(chatwoot_contact_id) WHERE chatwoot_contact_id IS NOT NULL',
      replace(rec.db_name, 'dp_', ''), rec.db_name);
    RAISE NOTICE 'Updated schema: %', rec.db_name;
  END LOOP;
END;
$$;

-- 2) Atualizar provision_tenant_schema para incluir novas colunas em novos tenants
-- (Não recria a função inteira, apenas o DO block acima cuida dos existentes)

-- 3) Criar/Substituir a função find_or_create_webhook_conversation
--    Agora busca primeiro por chatwoot_conversation_id, depois por external_user_id
DROP FUNCTION IF EXISTS public.find_or_create_webhook_conversation(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.find_or_create_webhook_conversation(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.find_or_create_webhook_conversation(
  p_agent_id UUID,
  p_channel TEXT,
  p_external_user_id TEXT,
  p_chatwoot_conversation_id INTEGER DEFAULT NULL,
  p_chatwoot_contact_id INTEGER DEFAULT NULL,
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

  -- 1) Buscar por chatwoot_conversation_id (mais preciso)
  IF p_chatwoot_conversation_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT id FROM %I.conversations WHERE agent_id = $1 AND chatwoot_conversation_id = $2 AND status = ''open'' LIMIT 1',
      v_schema
    ) INTO v_conv_id USING p_agent_id, p_chatwoot_conversation_id;

    IF v_conv_id IS NOT NULL THEN
      -- Atualizar dados de contato se necessário
      IF p_contact_name IS NOT NULL OR p_contact_avatar_url IS NOT NULL THEN
        EXECUTE format(
          'UPDATE %I.conversations SET contact_name = COALESCE($2, contact_name), contact_avatar_url = COALESCE($3, contact_avatar_url) WHERE id = $1',
          v_schema
        ) USING v_conv_id, p_contact_name, p_contact_avatar_url;
      END IF;
      RETURN v_conv_id;
    END IF;
  END IF;

  -- 2) Fallback: buscar por external_user_id + channel
  EXECUTE format(
    'SELECT id FROM %I.conversations WHERE agent_id = $1 AND channel = $2 AND external_user_id = $3 AND status = ''open'' ORDER BY started_at DESC LIMIT 1',
    v_schema
  ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id;

  IF v_conv_id IS NOT NULL THEN
    -- Vincular chatwoot IDs se ainda não tiver
    IF p_chatwoot_conversation_id IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I.conversations SET chatwoot_conversation_id = COALESCE(chatwoot_conversation_id, $2), chatwoot_contact_id = COALESCE(chatwoot_contact_id, $3), contact_name = COALESCE($4, contact_name), contact_avatar_url = COALESCE($5, contact_avatar_url) WHERE id = $1',
        v_schema
      ) USING v_conv_id, p_chatwoot_conversation_id, p_chatwoot_contact_id, p_contact_name, p_contact_avatar_url;
    END IF;
    RETURN v_conv_id;
  END IF;

  -- 3) Criar nova conversa
  EXECUTE format(
    'INSERT INTO %I.conversations (agent_id, channel, external_user_id, chatwoot_conversation_id, chatwoot_contact_id, contact_name, contact_avatar_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    v_schema
  ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id, p_chatwoot_conversation_id, p_chatwoot_contact_id, p_contact_name, p_contact_avatar_url;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_or_create_webhook_conversation(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

-- 4) Atualizar list_agent_conversations para incluir novos campos
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
     ORDER BY c.started_at DESC
     LIMIT $2',
    v_schema, v_schema
  ) USING p_agent_id, p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO authenticated;
