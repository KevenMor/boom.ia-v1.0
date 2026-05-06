-- Garante que service_role pode executar as RPCs de histórico de conversa
-- (service_role é superusuário no Supabase e normalmente não precisa de GRANT,
--  mas em algumas configurações self-hosted pode ser necessário)

GRANT EXECUTE ON FUNCTION public.provision_tenant_schema(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_conversation(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_message(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.load_conversation_messages(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_agent_conversations(UUID, INTEGER) TO service_role;
