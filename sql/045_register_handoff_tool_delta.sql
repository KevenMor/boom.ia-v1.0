-- Boom IA — Tool de transferência para atendente humano (Chatwoot) — Delta Empreendimentos (Paula)
-- Pré-requisito: tool_type chatwoot_assign liberado (sql/014 ou migrations equivalentes)
-- Após rodar: configure team_id ou assignee_id em execution_config no painel (Tools → regras).

DO $register_delta_handoff_tool$
DECLARE
  v_tenant uuid;
  v_tool_id uuid;
  v_linked_count int := 0;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('delta-empreendimentos', 'delta_empreendimentos', 'delta')
  ORDER BY CASE t.slug
    WHEN 'delta-empreendimentos' THEN 1
    WHEN 'delta_empreendimentos' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Delta Empreendimentos não encontrado. Pulando registro da tool de handoff.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'encaminhar_atendente'
    AND tool_type = 'chatwoot_assign'
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
      'encaminhar_atendente',
      'Transfere a conversa no Chatwoot para a equipe humana (comercial, financeiro ou setor responsável).',
      'function',
      'chatwoot_assign',
      v_tenant,
      '{
        "name": "encaminhar_atendente",
        "description": "Encaminha o atendimento a um atendente/time humano no Chatwoot. Use quando Paula deve transferir: tabela/condições/visita (Equipe comercial), boleto/pagamento pós-venda (Financeiro), reclamação/cancelamento/pedido de humano/assunto fora do escopo (Setor responsável). Cancela follow-ups automaticamente após atribuição.",
        "parameters": {
          "type": "object",
          "properties": {
            "reason": {
              "type": "string",
              "description": "Motivo/setor: Equipe comercial | Financeiro | Setor responsável"
            }
          },
          "required": ["reason"]
        }
      }'::JSONB,
      '{
        "rules": [
          { "label": "Equipe comercial" },
          { "label": "Financeiro" },
          { "label": "Setor responsável" }
        ]
      }'::JSONB
    )
    RETURNING id INTO v_tool_id;
    RAISE NOTICE 'Tool encaminhar_atendente criada.';
  ELSE
    UPDATE public.tools
    SET
      description = 'Transfere a conversa no Chatwoot para a equipe humana (comercial, financeiro ou setor responsável).',
      function_def = '{
        "name": "encaminhar_atendente",
        "description": "Encaminha o atendimento a um atendente/time humano no Chatwoot. Use quando Paula deve transferir: tabela/condições/visita (Equipe comercial), boleto/pagamento pós-venda (Financeiro), reclamação/cancelamento/pedido de humano/assunto fora do escopo (Setor responsável). Cancela follow-ups automaticamente após atribuição.",
        "parameters": {
          "type": "object",
          "properties": {
            "reason": {
              "type": "string",
              "description": "Motivo/setor: Equipe comercial | Financeiro | Setor responsável"
            }
          },
          "required": ["reason"]
        }
      }'::JSONB,
      execution_config = COALESCE(execution_config, '{}'::JSONB) || '{
        "rules": [
          { "label": "Equipe comercial" },
          { "label": "Financeiro" },
          { "label": "Setor responsável" }
        ]
      }'::JSONB
    WHERE id = v_tool_id;
    RAISE NOTICE 'Tool encaminhar_atendente já existe (id=%). Atualizada descrição/function_def/rules.', v_tool_id;
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

  RAISE NOTICE 'Tool encaminhar_atendente vinculada a % novo(s) agente(s) Delta.', v_linked_count;
  RAISE NOTICE 'Configure team_id ou assignee_id em execution_config (painel Tools) para cada regra/setor.';
END
$register_delta_handoff_tool$;
