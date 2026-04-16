-- Alinha tabelas dp_*.conversations com o que list_agent_conversations (20260406120000) espera.
-- Corrige erro 42703: column c.chatwoot_assignee_name does not exist em tenants criados/atualizados
-- sem ter corrido as migrations que só faziam ALTER nos tenants existentes na época.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_name FROM public.tenants WHERE db_name IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS contact_name TEXT',
      r.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT',
      r.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER',
      r.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_contact_id INTEGER',
      r.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT ''{}''',
      r.db_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS chatwoot_assignee_name TEXT',
      r.db_name
    );
  END LOOP;
END $$;
