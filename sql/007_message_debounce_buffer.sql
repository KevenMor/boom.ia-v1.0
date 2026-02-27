-- ============================================================
-- 007 — Tabela de buffer para debounce de mensagens webhook
-- Permite acumular mensagens "picadas" do cliente antes de
-- consolidar e enviar à LLM como um único contexto.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_message_buffer (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id      uuid        NOT NULL,
  external_user_id text     NOT NULL,
  channel       text        NOT NULL DEFAULT 'webhook',
  content       text        NOT NULL,
  chatwoot_conversation_id integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed     boolean     NOT NULL DEFAULT false
);

-- Índice para buscas rápidas de mensagens pendentes por agente+usuário+canal
CREATE INDEX IF NOT EXISTS idx_wmb_pending
  ON public.webhook_message_buffer (agent_id, external_user_id, channel)
  WHERE processed = false;

-- Limpeza automática de mensagens antigas (processadas há mais de 24h)
-- Pode ser executado via cron externo: DELETE FROM webhook_message_buffer WHERE processed = true AND created_at < now() - interval '24 hours';
