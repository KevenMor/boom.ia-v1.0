-- Boom IA — Tool send_notification (grupo aguardando atendimento) — Sunset Thermas Park
-- Pré-requisito: tool_type send_notification liberado (sql/014)
-- conversation_id Chatwoot: 2407 (grupo de aguardando atendimento)
-- Uso: disparada AUTOMATICAMENTE após chatwoot_assign bem-sucedido (mesmo padrão PPL Motors).
-- Não precisa ser chamada pelo LLM — o runtime usa execution_config.conversation_id.

DO $register_sunset_notification$
DECLARE
  v_tenant uuid;
  v_tool_id uuid;
  v_linked_count int := 0;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Sunset não encontrado. Pulando registro da tool send_notification.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND tool_type = 'send_notification'
    AND name IN ('enviar_notificacao', 'notificar_equipe', 'send_notification')
  ORDER BY CASE name WHEN 'enviar_notificacao' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    INSERT INTO public.tools (
      name,
      description,
      type,
      tool_type,
      tenant_id,
      function_def,
      execution_config
    )
    VALUES (
      'enviar_notificacao',
      'Config interna: envia alerta "Cliente aguardando atendimento" ao grupo Chatwoot após handoff. Não chamar pelo LLM — o backend dispara automaticamente.',
      'function',
      'send_notification',
      v_tenant,
      '{
        "name": "enviar_notificacao",
        "description": "NÃO chamar manualmente. Notificação automática no handoff (chatwoot_assign).",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }'::JSONB,
      '{"conversation_id": 2407}'::JSONB
    )
    RETURNING id INTO v_tool_id;
    RAISE NOTICE 'Tool enviar_notificacao (Sunset) criada com conversation_id=2407.';
  ELSE
    UPDATE public.tools
    SET execution_config = COALESCE(execution_config, '{}'::JSONB) || '{"conversation_id": 2407}'::JSONB
    WHERE id = v_tool_id;
    RAISE NOTICE 'Tool send_notification Sunset atualizada (id=%) conversation_id=2407.', v_tool_id;
  END IF;

  WITH inserted AS (
    INSERT INTO public.agent_tools (agent_id, tool_id)
    SELECT a.id, v_tool_id
    FROM public.agents a
    WHERE a.tenant_id = v_tenant
    ON CONFLICT (agent_id, tool_id) DO NOTHING
    RETURNING agent_id
  )
  SELECT COUNT(*) INTO v_linked_count FROM inserted;

  RAISE NOTICE 'Tool enviar_notificacao vinculada a % novo(s) agente(s) Sunset.', v_linked_count;
END
$register_sunset_notification$;
