-- ============================================================
-- Boom IA — RPCs de atribuição de atendente e busca de chatwoot_conversation_id
-- Execute no Supabase SQL Editor ou psql
-- ============================================================

-- 1. RPC para buscar o chatwoot_conversation_id de uma conversa
CREATE OR REPLACE FUNCTION public.get_conversation_chatwoot_id(
  p_agent_id UUID,
  p_conversation_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
  v_cw_id INTEGER;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE format(
    'SELECT chatwoot_conversation_id FROM %I.conversations WHERE id = $1',
    v_schema
  ) USING p_conversation_id INTO v_cw_id;

  RETURN v_cw_id;
END;
$$;

-- 2. RPC para atualizar o chatwoot_assignee_name de uma conversa no schema correto
CREATE OR REPLACE FUNCTION public.update_conversation_assignee(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_chatwoot_assignee_name TEXT
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
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE %I.conversations SET chatwoot_assignee_name = $2 WHERE id = $1',
    v_schema
  ) USING p_conversation_id, p_chatwoot_assignee_name;
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.get_conversation_chatwoot_id(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_chatwoot_id(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_conversation_assignee(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_conversation_assignee(UUID, UUID, TEXT) TO service_role;
