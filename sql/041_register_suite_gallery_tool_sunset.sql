-- Boom IA — Registro da tool suite_gallery_query para Sunset Thermas Park
-- Pré-requisito: tool_type suite_gallery_query liberado (sql/026 ou 031/032)
-- Executar antes de sql/037_link_suite_gallery_tool_to_sunset_agent.sql

DO $register_gallery_tool$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Sunset não encontrado. Pulando registro da tool de galeria.';
    RETURN;
  END IF;

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
    'Consulta galerias de fotos e vídeos cadastradas no painel Galeria do tenant (Markdown + URLs de vídeo)',
    'suite_gallery_query',
    v_tenant,
    '{
      "name": "suite_gallery_query",
      "description": "Galerias do tenant (fotos Markdown, URLs de vídeo). Parâmetros: nome/nome_galeria para filtrar; contexto/tema/topico para busca temática (ex.: Chalé, Institucional, piscina).",
      "parameters": {
        "type": "object",
        "properties": {
          "nome": { "type": "string", "description": "Nome ou parte do nome da galeria" },
          "nome_galeria": { "type": "string", "description": "Alias de nome" },
          "contexto": { "type": "string", "description": "Tema do pedido (ex.: piscina, chalé)" },
          "tema": { "type": "string", "description": "Alias de contexto" },
          "topico": { "type": "string", "description": "Alias de contexto" },
          "filtro": { "type": "string" },
          "q": { "type": "string" }
        }
      }
    }'::JSONB,
    '{}'::JSONB
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tool suite_gallery_query registrada para Sunset Thermas Park.';
END
$register_gallery_tool$;
