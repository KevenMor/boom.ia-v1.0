-- Delete conversations and their messages for a given agent
-- Uses the same tenant-schema-lookup pattern as other conversation functions

CREATE OR REPLACE FUNCTION public.delete_conversations(
  p_agent_id UUID,
  p_conversation_ids UUID[]
)
RETURNS TABLE(deleted_messages BIGINT, deleted_conversations BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema TEXT;
  v_msg_count BIGINT;
  v_conv_count BIGINT;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  -- Delete messages first (FK constraint)
  EXECUTE format(
    'DELETE FROM %I.messages WHERE conversation_id = ANY($1)',
    v_schema
  ) USING p_conversation_ids;
  GET DIAGNOSTICS v_msg_count = ROW_COUNT;

  -- Delete conversations
  EXECUTE format(
    'DELETE FROM %I.conversations WHERE id = ANY($1)',
    v_schema
  ) USING p_conversation_ids;
  GET DIAGNOSTICS v_conv_count = ROW_COUNT;

  RETURN QUERY SELECT v_msg_count, v_conv_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_conversations(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_conversations(UUID, UUID[]) TO service_role;
