-- Boom IA — Tool de encaminhamento ao setor responsável (Chatwoot) — Sunset Thermas Park
-- Pré-requisito: tool_type chatwoot_assign liberado (sql/014 ou migrations equivalentes)
-- Após rodar: configure team_id ou assignee_id em execution_config no painel (Tools).

DO $register_handoff_tool$
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
    RAISE NOTICE 'Tenant Sunset não encontrado. Pulando registro da tool de handoff.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'encaminhar_setor_responsavel'
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
      'encaminhar_setor_responsavel',
      'Transfere a conversa no Chatwoot para o setor responsável (reservas, excursões ou atendimento geral).',
      'function',
      'chatwoot_assign',
      v_tenant,
      '{
        "name": "encaminhar_setor_responsavel",
        "description": "Encaminha o atendimento ao setor humano no Chatwoot. Use quando Julia não puder resolver (finalizar reserva, excursão, reclamação, assunto fora do escopo). Cancela follow-ups automaticamente após atribuição.",
        "parameters": {
          "type": "object",
          "properties": {
            "reason": {
              "type": "string",
              "description": "Motivo/setor: Setor de reservas | Excursões | Setor responsável"
            }
          },
          "required": ["reason"]
        }
      }'::JSONB,
      '{
        "rules": [
          { "label": "Setor de reservas" },
          { "label": "Excursões" },
          { "label": "Setor responsável" }
        ]
      }'::JSONB
    )
    RETURNING id INTO v_tool_id;
    RAISE NOTICE 'Tool encaminhar_setor_responsavel criada.';
  ELSE
    RAISE NOTICE 'Tool encaminhar_setor_responsavel já existe (id=%).', v_tool_id;
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

  RAISE NOTICE 'Tool encaminhar_setor_responsavel vinculada a % novo(s) agente(s) Sunset.', v_linked_count;
  RAISE NOTICE 'Configure team_id ou assignee_id em execution_config no painel para cada regra/setor.';
END
$register_handoff_tool$;
