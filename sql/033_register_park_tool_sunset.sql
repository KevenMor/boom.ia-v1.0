-- Boom IA — Registro da tool de consulta do parque (ingresso/abertura) — Sunset Thermas Park
-- Executar após sql/032_park_consulta_tool_type.sql

DO $register_park_tool$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Sunset não encontrado. Pulando registro da tool de parque.';
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
    'consultar_parque_sunset',
    'Consulta calendário do parque: aberto/fechado e valores de ingresso cadastrados por data',
    'park_consulta',
    v_tenant,
    '{
      "name": "consultar_parque_sunset",
      "description": "Consulta o calendário do parque (lodging_park_days) para uma data: se está aberto, fechado ou em manutenção, e valores de ingresso cadastrados no painel. Use quando o cliente perguntar preço de ingresso, valor para ir ao parque hoje/amanhã, ou se o parque está aberto em uma data. Parâmetro date em YYYY-MM-DD.",
      "parameters": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "Data da visita ao parque em YYYY-MM-DD. Converter hoje/amanhã usando o contexto temporal."
          }
        },
        "required": ["date"]
      }
    }'::JSONB,
    '{}'::JSONB
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tool consultar_parque_sunset registrada para Sunset Thermas Park.';
END
$register_park_tool$;
