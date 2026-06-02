-- Boom IA — Vínculo da tool Artaxnet ao(s) agente(s) da Pousada Flores do Lázaro
-- Pré-requisitos: sql/031 + sql/032

DO $link_tool$
DECLARE
  v_tenant uuid;
  v_tool_id uuid;
  v_linked_count int := 0;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('pousada-flores-do-lazaro', 'flores-do-lazaro', 'flores-do-lázaro')
  ORDER BY CASE t.slug WHEN 'pousada-flores-do-lazaro' THEN 1 WHEN 'flores-do-lazaro' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Pousada Flores do Lázaro não encontrado. Abortando.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND name = 'consultar_disponibilidade_flores_lazaro'
    AND tool_type = 'artaxnet_availability'
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    RAISE NOTICE 'Tool consultar_disponibilidade_flores_lazaro não encontrada. Rode sql/032 antes.';
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

  RAISE NOTICE 'Tool Artaxnet vinculada a % novo(s) agente(s) do tenant Pousada Flores do Lázaro.', v_linked_count;
END
$link_tool$;
