-- Boom IA — Tool consultar_disponibilidade_flores_lazaro (Artaxnet)
-- Pré-requisito: sql/031_artaxnet_tool_type.sql

DO $register_tool$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('pousada-flores-do-lazaro', 'flores-do-lazaro', 'flores-do-lázaro')
  ORDER BY CASE t.slug WHEN 'pousada-flores-do-lazaro' THEN 1 WHEN 'flores-do-lazaro' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Pousada Flores do Lázaro não encontrado. Pulando registro da tool.';
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
    'consultar_disponibilidade_flores_lazaro',
    'Consulta disponibilidade e tarifas no motor Artaxnet da Pousada Flores do Lázaro (Ubatuba)',
    'artaxnet_availability',
    v_tenant,
    '{
      "name": "consultar_disponibilidade_flores_lazaro",
      "description": "Consulta read-only no motor Artaxnet: quartos, totais da estadia, café da manhã, condições de pagamento e link de reserva. Parâmetros: check_in, check_out (YYYY-MM-DD ou DDMMYYYY), adults, children (ou kids). Só cite valores em R$ após resultado neste turno com rooms e summaryText válidos.",
      "parameters": {
        "type": "object",
        "properties": {
          "check_in": { "type": "string", "description": "Data de entrada YYYY-MM-DD ou DDMMYYYY" },
          "check_out": { "type": "string", "description": "Data de saída YYYY-MM-DD ou DDMMYYYY" },
          "adults": { "type": "number", "description": "Número de adultos" },
          "children": { "type": "number", "description": "Número de crianças (0 se nenhuma)" },
          "kids": { "type": "number", "description": "Alias de children" },
          "coupon": { "type": "string", "description": "Cupom promocional (opcional)" }
        },
        "required": ["check_in", "check_out", "adults"]
      }
    }'::JSONB,
    '{"base_url": "https://pousada-flores-do-lazaro.artaxnet.com"}'::JSONB
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tool consultar_disponibilidade_flores_lazaro registrada para tenant Pousada Flores do Lázaro.';
END
$register_tool$;
