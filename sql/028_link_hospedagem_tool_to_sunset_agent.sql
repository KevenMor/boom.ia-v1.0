-- Boom IA — Vínculo da tool de hospedagem ao(s) agente(s) Julia do Sunset Thermas Park.
-- Pré-requisitos (rodar antes, na ordem):
--   1) sql/026_lodging_consulta_tool_type.sql — libera tool_type 'lodging_consulta' no CHECK.
--   2) sql/025_register_hospedagem_tool_sunset.sql — insere a tool em public.tools.
--   3) sql/024_lodging_seed_rate_items_sunset.sql + sql/021_lodging_seed_units_from_pms_screenshots.sql
--      + dados do calendário em public.lodging_park_days (via painel Gestão de Reservas).
--
-- Esse arquivo apenas LIGA a tool ao agente em public.agent_tools — sem essa linha,
-- load_agent_tools(agent_id) retorna vazio e o LLM recebe 0 tools (Julia responde só do system prompt).
--
-- Idempotente: ON CONFLICT DO NOTHING usa a PK composta (agent_id, tool_id).

DO $link_tool$
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
    RAISE NOTICE 'Tenant Sunset Thermas não encontrado. Abortando.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'consultar_hospedagem_sunset'
    AND tool_type = 'lodging_consulta'
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    RAISE NOTICE 'Tool consultar_hospedagem_sunset não encontrada para o tenant Sunset. Rode sql/025 antes.';
    RETURN;
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

  RAISE NOTICE 'Tool consultar_hospedagem_sunset vinculada a % novo(s) agente(s) do tenant Sunset Thermas Park.', v_linked_count;
END
$link_tool$;
