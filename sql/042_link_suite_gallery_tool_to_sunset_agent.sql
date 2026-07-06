-- Boom IA — Vínculo da tool suite_gallery_query ao(s) agente(s) Julia do Sunset Thermas Park
-- Pré-requisito: sql/041_register_suite_gallery_tool_sunset.sql
-- Sem este vínculo, load_agent_tools não retorna a galeria (o runtime injeta fallback, mas o ideal é vincular no banco).

DO $link_gallery_tool$
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
    AND tool_type = 'suite_gallery_query'
  ORDER BY CASE WHEN name = 'suite_gallery_query' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    RAISE NOTICE 'Tool suite_gallery_query não encontrada para o tenant Sunset. Rode sql/041 antes.';
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

  RAISE NOTICE 'Tool suite_gallery_query vinculada a % novo(s) agente(s) do tenant Sunset Thermas Park.', v_linked_count;
END
$link_gallery_tool$;
