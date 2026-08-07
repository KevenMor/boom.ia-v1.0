-- Boom IA — Registro da tool suite_gallery_query para Delta Empreendimentos
-- Pré-requisito: tool_type suite_gallery_query liberado (sql/026 ou 031/032)

DO $register_gallery_tool$
DECLARE
  v_tenant uuid;
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
    RAISE NOTICE 'Tenant Delta não encontrado. Pulando registro da tool de galeria.';
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
      "description": "Galerias do tenant (fotos Markdown, URLs de vídeo). Parâmetros: nome/nome_galeria para filtrar; contexto/tema/topico para busca temática (ex.: Vale dos Cervos 5, Reservas do Brasil).",
      "parameters": {
        "type": "object",
        "properties": {
          "nome": { "type": "string", "description": "Nome ou parte do nome da galeria" },
          "nome_galeria": { "type": "string", "description": "Alias de nome" },
          "contexto": { "type": "string", "description": "Tema do pedido (ex.: chácara, lazer)" },
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

  RAISE NOTICE 'Tool suite_gallery_query registrada para Delta Empreendimentos.';
END
$register_gallery_tool$;
