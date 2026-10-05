-- Boom IA — Registro + vínculo da tool suite_gallery_query para Divino Chalé (Lara)
-- Pré-requisito: tool_type suite_gallery_query liberado (sql/026 ou 031/032)

DO $register_gallery_tool_divino$
DECLARE
  v_tenant uuid;
  v_tool uuid;
  v_linked_count int := 0;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('divino-chale', 'divinochale')
  ORDER BY CASE t.slug WHEN 'divino-chale' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Divino Chalé não encontrado. Pulando registro da tool de galeria.';
    RETURN;
  END IF;

  SELECT id INTO v_tool
  FROM public.tools
  WHERE tenant_id = v_tenant
    AND tool_type = 'suite_gallery_query'
  ORDER BY CASE WHEN name = 'suite_gallery_query' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tool IS NULL THEN
    INSERT INTO public.tools (
      name,
      description,
      tool_type,
      tenant_id,
      function_def,
      execution_config
    )
    VALUES (
      'suite_gallery_query',
      'Consulta galerias de fotos do Divino Chalé cadastradas no painel Galeria (Markdown)',
      'suite_gallery_query',
      v_tenant,
      '{
        "name": "suite_gallery_query",
        "description": "Galerias do tenant (fotos Markdown). Parâmetros: nome/nome_galeria; contexto/tema/topico.",
        "parameters": {
          "type": "object",
          "properties": {
            "nome": { "type": "string", "description": "Nome ou parte do nome da galeria" },
            "nome_galeria": { "type": "string", "description": "Alias de nome" },
            "contexto": { "type": "string", "description": "Tema do pedido" },
            "tema": { "type": "string" },
            "topico": { "type": "string" },
            "filtro": { "type": "string" },
            "q": { "type": "string" }
          }
        }
      }'::JSONB,
      '{}'::JSONB
    )
    RETURNING id INTO v_tool;
  END IF;

  INSERT INTO public.agent_tools (agent_id, tool_id)
  SELECT a.id, v_tool
  FROM public.agents a
  WHERE a.tenant_id = v_tenant
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_tools at
      WHERE at.agent_id = a.id AND at.tool_id = v_tool
    );

  GET DIAGNOSTICS v_linked_count = ROW_COUNT;
  RAISE NOTICE 'suite_gallery_query Divino Chalé: tool=% ; vínculos novos=%', v_tool, v_linked_count;
END
$register_gallery_tool_divino$;
