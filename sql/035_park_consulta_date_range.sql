-- Boom IA — consultar_parque_sunset: suporte a intervalo (date_to)
-- Executar após sql/033_register_park_tool_sunset.sql

UPDATE public.tools
SET
  description = 'Consulta calendário do parque: aberto/fechado e valores de ingresso por data ou intervalo',
  function_def = '{
    "name": "consultar_parque_sunset",
    "description": "Consulta lodging_park_days para uma data ou intervalo (date + date_to inclusive): aberto/fechado/manutenção e valores de ingresso. Obrigatório date_to quando o cliente perguntar sobre vários dias (ex.: 01 a 03 de julho).",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "description": "Primeiro dia da visita em YYYY-MM-DD"
        },
        "date_to": {
          "type": "string",
          "description": "Último dia inclusive em YYYY-MM-DD. Obrigatório quando o cliente citar intervalo (01 a 03, de X a Y)."
        }
      },
      "required": ["date"]
    }
  }'::JSONB
WHERE tool_type = 'park_consulta'
  AND name = 'consultar_parque_sunset';
