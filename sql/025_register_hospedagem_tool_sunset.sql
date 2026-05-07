-- Boom IA — Registro da Tool de Hospedagem para Agente Julia (Sunset Thermas Park)
-- Executar no Supabase SQL Editor após:
--   1) sql/026_lodging_consulta_tool_type.sql (ou migration 20260507190000) — libera tool_type lodging_consulta
--   2) dados de calendário e tarifas
-- Tool interna: tool_type lodging_consulta (sem URL; executor no servidor).

DO $register_tool$
DECLARE
  v_tenant uuid;
  v_tool_id uuid;
BEGIN
  -- Buscar tenant Sunset Thermas Park
  SELECT t.id INTO v_tenant
  FROM public.tenants t
  WHERE t.slug IN ('sunset-thermas-park', 'sunset-thermas')
  ORDER BY CASE t.slug WHEN 'sunset-thermas-park' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant Sunset não encontrado. Pulando registro da tool.';
    RETURN;
  END IF;

  -- Registrar tool de consulta de hospedagem
  INSERT INTO public.tools (
    name,
    description,
    tool_type,
    tenant_id,
    function_def,
    execution_config
  )
  VALUES (
    'consultar_hospedagem_sunset',
    'Consulta disponibilidade e tarifas de hospedagem no Sunset Thermas Park com verificação de calendário, cálculo de cortesia para crianças e tarifação correta',
    'lodging_consulta',
    v_tenant,
    '{
      "name": "consultar_hospedagem_sunset",
      "description": "Consulta hospedagem: calendário do parque (dias abertos) e tarifas. Cortesia crianças: se a soma das idades das crianças até 12 anos for ≤12, todas cortesia (colchão adicional); senão tarifar adultos + 1 criança. Parâmetros: check_in, check_out (YYYY-MM-DD), guests (type adult|child, age para criança). O tenant vem da ferramenta.",
      "parameters": {
        "type": "object",
        "properties": {
          "check_in": { "type": "string", "description": "Data de entrada YYYY-MM-DD" },
          "check_out": { "type": "string", "description": "Data de saída YYYY-MM-DD" },
          "guests": {
            "type": "array",
            "description": "Lista de hóspedes: adultos e crianças com idades",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["adult", "child"], "description": "adult ou child" },
                "age": { "type": "number", "description": "Idade (obrigatório para child)" }
              },
              "required": ["type"]
            }
          }
        },
        "required": ["check_in", "check_out", "guests"]
      }
    }'::JSONB,
    '{}'::JSONB
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tool de hospedagem registrada com sucesso para tenant Sunset Thermas Park.';
END
$register_tool$;
