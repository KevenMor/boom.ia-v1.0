-- schedule_followup: definir cancel_reason ao cancelar itens pendentes (evita "Motivo não registrado")
-- Aplicar após 016_follow_up_cancel_reason.sql
CREATE OR REPLACE FUNCTION public.schedule_followup(
  p_agent_id UUID,
  p_conversation_id TEXT,
  p_external_user_id TEXT,
  p_channel TEXT,
  p_chatwoot_conversation_id BIGINT,
  p_attempt INTEGER,
  p_max_attempts INTEGER,
  p_intervals_minutes JSONB,
  p_delay_minutes INTEGER
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  UPDATE public.follow_up_queue
  SET status = 'cancelled', updated_at = now(), cancel_reason = 'superseded'
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id
    AND status = 'pending';

  INSERT INTO public.follow_up_queue (
    agent_id, conversation_id, external_user_id, channel,
    chatwoot_conversation_id, attempt, max_attempts,
    intervals_minutes, scheduled_at
  ) VALUES (
    p_agent_id, p_conversation_id, p_external_user_id, p_channel,
    p_chatwoot_conversation_id, p_attempt, p_max_attempts,
    p_intervals_minutes, now() + (p_delay_minutes || ' minutes')::interval
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;
