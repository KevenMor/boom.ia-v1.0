-- Motivo de cancelamento na fila de follow-up (exibir na página)
ALTER TABLE public.follow_up_queue
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN public.follow_up_queue.cancel_reason IS 'Motivo do cancelamento: human_assigned, user_replied, appointment_confirmed, agent_inactive, etc.';

-- Atualizar função para aceitar motivo ao cancelar por RPC (ex.: quando cliente envia mensagem)
CREATE OR REPLACE FUNCTION public.cancel_pending_followups(
  p_agent_id UUID,
  p_conversation_id TEXT,
  p_cancel_reason TEXT DEFAULT 'user_replied'
) RETURNS INTEGER AS $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  UPDATE public.follow_up_queue
  SET status = 'cancelled', updated_at = now(), cancel_reason = p_cancel_reason
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id
    AND status = 'pending';
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql;
