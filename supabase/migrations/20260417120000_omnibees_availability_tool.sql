-- Omnibees: novo tool_type + seed tool Vale Suíço (slug vale-suico ou vale-suico-resort)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'tools'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tool_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.tools DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.tools
  ADD CONSTRAINT tools_tool_type_check
  CHECK (tool_type IN (
    'sql_query', 'web_scraper', 'api_rest', 'rag_search',
    'inventory_query', 'nearest_unit', 'fipe_query',
    'calendar_query', 'chatwoot_assign', 'send_notification',
    'omnibees_availability'
  ));

DO $$
DECLARE
  v_tenant_id UUID;
  v_tool_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants
  WHERE slug IN ('vale-suico', 'vale-suico-resort')
  ORDER BY slug
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant vale-suico / vale-suico-resort não encontrado. Pule o seed ou crie o tenant.';
    RETURN;
  END IF;

  SELECT id INTO v_tool_id FROM public.tools
  WHERE tenant_id = v_tenant_id AND name = 'consultar_disponibilidade_vale_suico'
  LIMIT 1;

  IF v_tool_id IS NULL THEN
    INSERT INTO public.tools (tenant_id, name, description, tool_type, function_def, execution_config)
    VALUES (
      v_tenant_id,
      'consultar_disponibilidade_vale_suico',
      'Consulta disponibilidade e tarifas publicadas no motor Omnibees do Vale Suíço Resort para check-in, check-out e ocupação informados. Use antes de informar preços ou quartos. Somente leitura; a reserva final é pelo link oficial.',
      'omnibees_availability',
      '{
        "name": "consultar_disponibilidade_vale_suico",
        "description": "Consulta tarifas e acomodações no site de reservas Omnibees para o período e ocupação informados.",
        "parameters": {
          "type": "object",
          "properties": {
            "checkIn": { "type": "string", "description": "Check-in em DDMMYYYY (ex: 20042026) ou YYYY-MM-DD (ex: 2026-04-20)." },
            "checkOut": { "type": "string", "description": "Check-out em DDMMYYYY ou YYYY-MM-DD." },
            "adults": { "type": "number", "description": "Número de adultos (padrão 2)." },
            "children": { "type": "number", "description": "Número de crianças (padrão 0)." },
            "childAges": { "type": "string", "description": "Idades das crianças separadas por vírgula, ex: 5,8." },
            "rooms": { "type": "number", "description": "Número de quartos (padrão 1)." }
          },
          "required": ["checkIn", "checkOut"]
        }
      }'::jsonb,
      '{"chain_id":"4486","hotel_id":"8164","currency_id":"16","lang":"pt-BR"}'::jsonb
    )
    RETURNING id INTO v_tool_id;
  END IF;

  IF v_tool_id IS NOT NULL THEN
    INSERT INTO public.agent_tools (agent_id, tool_id)
    SELECT a.id, v_tool_id FROM public.agents a WHERE a.tenant_id = v_tenant_id
    ON CONFLICT (agent_id, tool_id) DO NOTHING;
    RAISE NOTICE 'Tool consultar_disponibilidade_vale_suico vinculada aos agentes do tenant %', v_tenant_id;
  END IF;
END $$;
