-- Boom IA — Vínculo da tool consultar_parque_sunset ao(s) agente(s) Julia do Sunset Thermas Park.
-- Pré-requisito: sql/033_register_park_tool_sunset.sql

DO $link_park_tool$
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
    AND name = 'consultar_parque_sunset'
    AND tool_type = 'park_consulta'
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    RAISE NOTICE 'Tool consultar_parque_sunset não encontrada. Rode sql/033 antes.';
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

  RAISE NOTICE 'Tool consultar_parque_sunset vinculada a % novo(s) agente(s) do tenant Sunset.', v_linked_count;
END
$link_park_tool$;
