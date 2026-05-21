-- Boom IA — Tools Referency (Amanda SDR): estoque, agenda e handoff
-- Executar no Supabase SQL Editor após o tenant existir com slug 'referency'.
--
-- Pré-requisitos:
--   - sql/005_enhanced_tools.sql, 010, 013, 014, 026 (tool_types permitidos)
--   - Tenant public.tenants com slug = 'referency'
--   - Agente(s) em public.agents para esse tenant
--
-- ANTES DE RODAR EM PRODUÇÃO:
--   1) Substitua v_assignee_id abaixo pelo ID numérico do atendente no Chatwoot.
--   2) Confirme módulo inventory habilitado para o tenant (painel / tenant_modules).

DO $referency_tools$
DECLARE
  v_tenant uuid;
  v_tool_estoque uuid;
  v_tool_agenda uuid;
  v_tool_handoff uuid;
  v_linked_count int := 0;
  -- ★ ALTERE AQUI: ID do agente humano no Chatwoot (Settings → Agents → ID na URL)
  v_assignee_id int := NULL;  -- ex.: 15
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug = 'referency'
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant slug "referency" não encontrado. Crie o tenant antes de rodar este script.';
    RETURN;
  END IF;

  -- ── 1) consultar_estoque (inventory_query) ─────────────────────────────
  SELECT id INTO v_tool_estoque
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'consultar_estoque'
    AND tool_type = 'inventory_query'
  LIMIT 1;

  IF v_tool_estoque IS NULL THEN
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
      'consultar_estoque',
      'Consulta o estoque de veículos da Referency (novos e seminovos). Use quando o cliente perguntar disponibilidade, modelos, preços, fotos ou detalhes.',
      'function',
      'inventory_query',
      v_tenant,
      '{
        "name": "consultar_estoque",
        "description": "Busca veículos no estoque da Referency. Preencha apenas os filtros que o cliente mencionou (marca, modelo, ano, cor, câmbio, combustível, tipo de carroceria, faixa de preço). Para pedidos de fotos ou follow-up sobre um veículo já citado, use marca+modelo do histórico.",
        "parameters": {
          "type": "object",
          "properties": {
            "marca": { "type": "string", "description": "Marca do veículo (ex.: Audi, Chevrolet, BMW)" },
            "modelo": { "type": "string", "description": "Modelo ou categoria (ex.: A3, Onix, SUV, sedan, pickup/caminhonete)" },
            "ano": { "type": "integer", "description": "Ano do veículo" },
            "cor": { "type": "string", "description": "Cor (ex.: branco, preto, prata)" },
            "cambio": { "type": "string", "description": "Câmbio (manual ou automático)" },
            "combustivel": { "type": "string", "description": "Combustível (flex, gasolina, diesel, etc.)" },
            "tipo": { "type": "string", "description": "Tipo de carroceria: SUV, sedan, hatch, pickup (caminhonete)" },
            "faixa_preco": { "type": "string", "description": "Faixa de preço em texto (ex.: até 150000, de 80000 a 120000)" }
          },
          "required": []
        }
      }'::JSONB,
      '{}'::JSONB
    )
    RETURNING id INTO v_tool_estoque;
    RAISE NOTICE 'Tool consultar_estoque criada.';
  ELSE
    RAISE NOTICE 'Tool consultar_estoque já existe (id=%).', v_tool_estoque;
  END IF;

  -- ── 2) consultar_agenda (calendar_query) ───────────────────────────────
  SELECT id INTO v_tool_agenda
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'consultar_agenda'
    AND tool_type = 'calendar_query'
  LIMIT 1;

  IF v_tool_agenda IS NULL THEN
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
      'consultar_agenda',
      'Consulta disponibilidade e gerencia visitas/test drive na agenda da Referency.',
      'function',
      'calendar_query',
      v_tenant,
      '{
        "name": "consultar_agenda",
        "description": "Agenda da loja: check_availability (horários livres), criar (confirmar visita), cancelar, reagendar, listar_eventos. Use timezone -03:00 em start_at. Inclua telefone_cliente e veiculo_interesse ao criar.",
        "parameters": {
          "type": "object",
          "properties": {
            "action": {
              "type": "string",
              "enum": ["check_availability", "criar", "cancelar", "reagendar", "listar_eventos"],
              "description": "Ação: check_availability | criar | cancelar | reagendar | listar_eventos"
            },
            "date": { "type": "string", "description": "Data YYYY-MM-DD para consulta de disponibilidade" },
            "days_ahead": { "type": "integer", "description": "Dias à frente para check_availability (padrão 3)" },
            "title": { "type": "string", "description": "Título do evento (ex.: Visita - Nome - Audi A3)" },
            "titulo": { "type": "string", "description": "Alias de title" },
            "start_at": { "type": "string", "description": "Início ISO com -03:00 (ex.: 2026-05-21T14:00:00-03:00)" },
            "telefone_cliente": { "type": "string", "description": "WhatsApp/telefone do cliente" },
            "veiculo_interesse": { "type": "string", "description": "Veículo de interesse ou de troca" },
            "client_name": { "type": "string", "description": "Nome do cliente (cancelar/reagendar/listar)" },
            "event_id": { "type": "string", "description": "ID do evento (reagendar)" },
            "new_start_at": { "type": "string", "description": "Novo horário ISO (reagendar)" },
            "duration_minutes": { "type": "integer", "description": "Duração do slot em minutos (padrão 60)" }
          },
          "required": ["action"]
        }
      }'::JSONB,
      '{}'::JSONB
    )
    RETURNING id INTO v_tool_agenda;
    RAISE NOTICE 'Tool consultar_agenda criada.';
  ELSE
    RAISE NOTICE 'Tool consultar_agenda já existe (id=%).', v_tool_agenda;
  END IF;

  -- ── 3) atribuir_conversa (chatwoot_assign) ─────────────────────────────
  SELECT id INTO v_tool_handoff
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'atribuir_conversa'
    AND tool_type = 'chatwoot_assign'
  LIMIT 1;

  IF v_tool_handoff IS NULL THEN
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
      'atribuir_conversa',
      'Transfere o atendimento para um consultor humano no Chatwoot (negociação, financiamento completo, pedido explícito de vendedor).',
      'function',
      'chatwoot_assign',
      v_tenant,
      '{
        "name": "atribuir_conversa",
        "description": "Handoff para time comercial. Cancela follow-ups e envia notificação automática. Não chame entre 23:30 e 07:00.",
        "parameters": {
          "type": "object",
          "properties": {
            "assignee_id": { "type": "integer", "description": "ID do agente Chatwoot (opcional se configurado em execution_config)" },
            "team_id": { "type": "integer", "description": "ID do time Chatwoot (opcional)" },
            "reason": { "type": "string", "description": "Motivo do handoff (ex.: negociacao, financiamento, cliente_pediu_humano)" }
          },
          "required": []
        }
      }'::JSONB,
      CASE
        WHEN v_assignee_id IS NOT NULL THEN jsonb_build_object('assignee_id', v_assignee_id)
        ELSE '{}'::JSONB
      END
    )
    RETURNING id INTO v_tool_handoff;
    RAISE NOTICE 'Tool atribuir_conversa criada.';
  ELSE
    IF v_assignee_id IS NOT NULL THEN
      UPDATE public.tools
      SET execution_config = COALESCE(execution_config, '{}'::JSONB) || jsonb_build_object('assignee_id', v_assignee_id)
      WHERE id = v_tool_handoff;
    END IF;
    RAISE NOTICE 'Tool atribuir_conversa já existe (id=%).', v_tool_handoff;
  END IF;

  -- ── Vincular as 3 tools a todos os agentes do tenant ───────────────────
  WITH inserted AS (
    INSERT INTO public.agent_tools (agent_id, tool_id)
    SELECT a.id, t.id
    FROM public.agents a
    CROSS JOIN (
      SELECT v_tool_estoque AS id
      UNION ALL SELECT v_tool_agenda
      UNION ALL SELECT v_tool_handoff
    ) t
    WHERE a.tenant_id = v_tenant
    ON CONFLICT (agent_id, tool_id) DO NOTHING
    RETURNING agent_id, tool_id
  )
  SELECT COUNT(*) INTO v_linked_count FROM inserted;

  RAISE NOTICE 'Referency: % novo(s) vínculo(s) agent_tools (estoque + agenda + handoff).', v_linked_count;

  IF v_assignee_id IS NULL THEN
    RAISE NOTICE 'ATENÇÃO: v_assignee_id está NULL. Edite este script ou atualize tools.execution_config com assignee_id do Chatwoot.';
  END IF;
END
$referency_tools$;
