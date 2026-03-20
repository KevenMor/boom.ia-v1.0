-- Atualiza attachments de uma mensagem existente identificada por chatwoot_message_id.
-- Usado quando o Chatwoot envia dois webhooks (1º sem attachments, 2º com) para evitar duplicata.
-- Retorna o número de linhas atualizadas (0 ou 1).

CREATE OR REPLACE FUNCTION public.update_message_attachments(
  p_agent_id UUID,
  p_conversation_id UUID,
  p_chatwoot_message_id TEXT,
  p_attachments JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
  v_rows INTEGER;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  EXECUTE format(
    'UPDATE %I.messages SET metadata = COALESCE(metadata, ''{}''::jsonb) || jsonb_build_object(''attachments'', $3) WHERE conversation_id = $1 AND role = ''user'' AND (metadata->>''chatwoot_message_id'') = $2',
    v_schema
  ) USING p_conversation_id, p_chatwoot_message_id, p_attachments;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_message_attachments(UUID, UUID, TEXT, JSONB) TO authenticated;
