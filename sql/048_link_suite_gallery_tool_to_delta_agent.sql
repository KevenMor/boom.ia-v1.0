-- Boom IA — Vínculo da tool suite_gallery_query ao(s) agente(s) Manu do Delta Empreendimentos
-- Pré-requisito: sql/047_register_suite_gallery_tool_delta.sql

DO $link_gallery_tool$
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
    RAISE NOTICE 'Tenant Delta não encontrado. Abortando.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND tool_type = 'suite_gallery_query'
  ORDER BY CASE WHEN name = 'suite_gallery_query' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    RAISE NOTICE 'Tool suite_gallery_query não encontrada para o tenant Delta. Rode sql/047 antes.';
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

  RAISE NOTICE 'Tool suite_gallery_query vinculada a % novo(s) agente(s) do tenant Delta Empreendimentos.', v_linked_count;
END
$link_gallery_tool$;
