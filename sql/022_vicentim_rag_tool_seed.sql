-- ============================================================
-- Nexus AI — Seed: Tool RAG para Mariana (Instituto Vicentim Maekawa)
-- Execute no Supabase após provisionar o tenant
-- ============================================================
-- Cria a tool consultar_base_conhecimento e vincula à agente Mariana.

DO $$
DECLARE
  v_tenant_id UUID;
  v_agent_id UUID;
  v_tool_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'instituto-vicentim-maekawa' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'Tenant instituto-vicentim-maekawa não encontrado. Execute após provisionar.';
    RETURN;
  END IF;

  SELECT id INTO v_agent_id FROM public.agents WHERE tenant_id = v_tenant_id LIMIT 1;
  IF v_agent_id IS NULL THEN
    RAISE NOTICE 'Nenhum agente no tenant instituto-vicentim-maekawa.';
    RETURN;
  END IF;

  -- Buscar ou criar tool
  SELECT id INTO v_tool_id FROM public.tools
  WHERE tenant_id = v_tenant_id AND name = 'consultar_base_conhecimento' LIMIT 1;

  IF v_tool_id IS NULL THEN
    INSERT INTO public.tools (tenant_id, name, description, tool_type, function_def, execution_config)
    VALUES (
      v_tenant_id,
      'consultar_base_conhecimento',
      'Busca informações sobre tratamentos, procedimentos e dúvidas frequentes na base de conhecimento do Instituto Vicentim Maekawa. Use quando o lead perguntar sobre detalhes de tratamentos, como funciona um procedimento, ou dúvidas sobre os serviços.',
      'rag_search',
      '{
        "name": "consultar_base_conhecimento",
        "description": "Busca na base de conhecimento sobre tratamentos, procedimentos e dúvidas frequentes da clínica.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Pergunta ou termo de busca sobre tratamentos, procedimentos ou dúvidas frequentes"
            },
            "pergunta": {
              "type": "string",
              "description": "Pergunta ou termo de busca (alias de query)"
            }
          }
        }
      }'::jsonb,
      '{"limit": 5}'::jsonb
    )
    RETURNING id INTO v_tool_id;
  END IF;

  IF v_tool_id IS NOT NULL THEN
    INSERT INTO public.agent_tools (agent_id, tool_id)
    VALUES (v_agent_id, v_tool_id)
    ON CONFLICT (agent_id, tool_id) DO NOTHING;
    RAISE NOTICE 'Tool consultar_base_conhecimento vinculada à Mariana (agent_id: %)', v_agent_id;
  END IF;
END $$;
