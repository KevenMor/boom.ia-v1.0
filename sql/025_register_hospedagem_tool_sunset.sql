-- Boom IA — Registro da Tool de Hospedagem para Agente Julia (Sunset Thermas Park)
-- Executar no Supabase SQL Editor após a migration de rates estar pronta.
-- Esta tool implementa a lógica complexa de consulta de hospedagem com verificação de calendário
-- e cálculo correto de hóspedes (cortesia para crianças até 12 anos).

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
    'api_rest',
    v_tenant,
    '{
      "name": "consultar_hospedagem_sunset",
      "description": "Consulta hospedagem com verificação de disponibilidade do parque, cálculo de hóspedes considerando cortesias, e apresentação de tarifas",
      "parameters": {
        "type": "object",
        "properties": {
          "tenant_id": { "type": "string", "description": "ID do tenant (Sunset Thermas Park)" },
          "check_in": { "type": "string", "description": "Data de entrada em formato YYYY-MM-DD" },
          "check_out": { "type": "string", "description": "Data de saída em formato YYYY-MM-DD" },
          "guests": {
            "type": "array",
            "description": "Lista de hóspedes: adultos e crianças com suas idades",
            "items": {
              "type": "object",
              "properties": {
                "type": { "type": "string", "enum": ["adult", "child"], "description": "Tipo de hóspede: adulto ou criança" },
                "age": { "type": "number", "description": "Idade do hóspede (obrigatório para crianças)" }
              },
              "required": ["type"]
            }
          }
        },
        "required": ["tenant_id", "check_in", "check_out", "guests"]
      }
    }'::JSONB,
    '{
      "endpoint": "POST /hospedagem/consultar-sunset",
      "timeout_ms": 10000
    }'::JSONB
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Tool de hospedagem registrada com sucesso para tenant Sunset Thermas Park.';
END
$register_tool$;
