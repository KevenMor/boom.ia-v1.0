-- Boom IA — Handoff Chatwoot + notificação de grupo — Divino Chalé (Lara)
-- Pré-requisito: tool_types chatwoot_assign e send_notification liberados (sql/014)
-- Chatwoot account 17 (Mega):
--   assignee_id = 1 (Gabriella — humano; NÃO usar 60 Lara-bot)
--   conversation_id = 1 (grupo WhatsApp "Marketing Divino Chalé")
-- Fluxo: LLM chama encaminhar_atendente → runtime atribui → send_notification automático.

DO $register_handoff_notification_divino$
DECLARE
  v_tenant uuid;
  v_assign_id uuid;
  v_notify_id uuid;
  v_linked_assign int := 0;
  v_linked_notify int := 0;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('divino-chale', 'divinochale')
  ORDER BY CASE t.slug WHEN 'divino-chale' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Divino Chalé não encontrado. Pulando handoff/notificação.';
    RETURN;
  END IF;

  -- ── chatwoot_assign ──────────────────────────────────────────────
  SELECT id INTO v_assign_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND tool_type = 'chatwoot_assign'
    AND name IN ('encaminhar_atendente', 'encaminhar_setor_responsavel', 'atribuir_agente')
  ORDER BY CASE name
    WHEN 'encaminhar_atendente' THEN 1
    WHEN 'encaminhar_setor_responsavel' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_assign_id IS NULL THEN
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
      'encaminhar_atendente',
      'Transfere a conversa no Chatwoot para a equipe humana do Divino Chalé (Gabi). Cancela follow-ups e dispara alerta no grupo automaticamente.',
      'function',
      'chatwoot_assign',
      v_tenant,
      '{
        "name": "encaminhar_atendente",
        "description": "Encaminha o atendimento ao humano no Chatwoot. Use quando Lara precisar passar Pix/link, reserva, reclamação, endereço/acesso, ou o cliente pedir humano. Cancela follow-ups e notifica o grupo automaticamente.",
        "parameters": {
          "type": "object",
          "properties": {
            "reason": {
              "type": "string",
              "description": "Motivo curto: Pagamento | Reserva | Reclamação | Endereço | Setor responsável"
            }
          },
          "required": ["reason"]
        }
      }'::JSONB,
      '{
        "assignee_id": 1,
        "rules": [
          { "label": "Pagamento", "assignee_id": 1 },
          { "label": "Reserva", "assignee_id": 1 },
          { "label": "Reclamação", "assignee_id": 1 },
          { "label": "Endereço", "assignee_id": 1 },
          { "label": "Setor responsável", "assignee_id": 1 }
        ]
      }'::JSONB
    )
    RETURNING id INTO v_assign_id;
    RAISE NOTICE 'Tool encaminhar_atendente (Divino) criada id=%', v_assign_id;
  ELSE
    UPDATE public.tools
    SET
      name = 'encaminhar_atendente',
      description = 'Transfere a conversa no Chatwoot para a equipe humana do Divino Chalé (Gabi). Cancela follow-ups e dispara alerta no grupo automaticamente.',
      execution_config = COALESCE(execution_config, '{}'::JSONB) || '{
        "assignee_id": 1,
        "rules": [
          { "label": "Pagamento", "assignee_id": 1 },
          { "label": "Reserva", "assignee_id": 1 },
          { "label": "Reclamação", "assignee_id": 1 },
          { "label": "Endereço", "assignee_id": 1 },
          { "label": "Setor responsável", "assignee_id": 1 }
        ]
      }'::JSONB,
      function_def = '{
        "name": "encaminhar_atendente",
        "description": "Encaminha o atendimento ao humano no Chatwoot. Use quando Lara precisar passar Pix/link, reserva, reclamação, endereço/acesso, ou o cliente pedir humano. Cancela follow-ups e notifica o grupo automaticamente.",
        "parameters": {
          "type": "object",
          "properties": {
            "reason": {
              "type": "string",
              "description": "Motivo curto: Pagamento | Reserva | Reclamação | Endereço | Setor responsável"
            }
          },
          "required": ["reason"]
        }
      }'::JSONB
    WHERE id = v_assign_id;
    RAISE NOTICE 'Tool chatwoot_assign Divino atualizada id=%', v_assign_id;
  END IF;

  -- ── send_notification (grupo Marketing Divino Chalé, conv=1) ─────
  SELECT id INTO v_notify_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND tool_type = 'send_notification'
    AND name IN ('enviar_notificacao', 'notificar_equipe', 'send_notification')
  ORDER BY CASE name WHEN 'enviar_notificacao' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_notify_id IS NULL THEN
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
      'Config interna: alerta "Cliente aguardando atendimento" no grupo Chatwoot após handoff. Não chamar pelo LLM — o backend dispara automaticamente.',
      'function',
      'send_notification',
      v_tenant,
      '{
        "name": "enviar_notificacao",
        "description": "NÃO chamar manualmente. Notificação automática no handoff (encaminhar_atendente).",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }'::JSONB,
      '{"conversation_id": 1}'::JSONB
    )
    RETURNING id INTO v_notify_id;
    RAISE NOTICE 'Tool enviar_notificacao (Divino) criada conversation_id=1 id=%', v_notify_id;
  ELSE
    UPDATE public.tools
    SET execution_config = COALESCE(execution_config, '{}'::JSONB) || '{"conversation_id": 1}'::JSONB
    WHERE id = v_notify_id;
    RAISE NOTICE 'Tool send_notification Divino atualizada id=% conversation_id=1', v_notify_id;
  END IF;

  -- ── vincular aos agentes do tenant ───────────────────────────────
  WITH inserted AS (
    INSERT INTO public.agent_tools (agent_id, tool_id)
    SELECT a.id, v_assign_id
    FROM public.agents a
    WHERE a.tenant_id = v_tenant
    ON CONFLICT (agent_id, tool_id) DO NOTHING
    RETURNING agent_id
  )
  SELECT COUNT(*) INTO v_linked_assign FROM inserted;

  WITH inserted AS (
    INSERT INTO public.agent_tools (agent_id, tool_id)
    SELECT a.id, v_notify_id
    FROM public.agents a
    WHERE a.tenant_id = v_tenant
    ON CONFLICT (agent_id, tool_id) DO NOTHING
    RETURNING agent_id
  )
  SELECT COUNT(*) INTO v_linked_notify FROM inserted;

  RAISE NOTICE 'Divino handoff: assign=% (+% vínculos) notify=% (+% vínculos)',
    v_assign_id, v_linked_assign, v_notify_id, v_linked_notify;
END
$register_handoff_notification_divino$;
