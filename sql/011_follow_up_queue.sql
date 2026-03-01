-- Follow-up queue system
-- Stores scheduled follow-up messages per conversation

CREATE TABLE IF NOT EXISTS public.follow_up_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'chatwoot',
  chatwoot_conversation_id BIGINT,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  intervals_minutes JSONB NOT NULL DEFAULT '[10, 20, 30]',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled | exhausted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_queue_pending
  ON public.follow_up_queue (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_followup_queue_agent_conv
  ON public.follow_up_queue (agent_id, conversation_id, status);

-- Function to cancel pending follow-ups for a conversation (called when client replies)
CREATE OR REPLACE FUNCTION public.cancel_pending_followups(
  p_agent_id UUID,
  p_conversation_id TEXT
) RETURNS INTEGER AS $$
DECLARE
  cancelled_count INTEGER;
BEGIN
  UPDATE public.follow_up_queue
  SET status = 'cancelled', updated_at = now()
  WHERE agent_id = p_agent_id
    AND conversation_id = p_conversation_id
    AND status = 'pending';
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN cancelled_count;
END;
$$ LANGUAGE plpgsql;

-- Function to schedule a follow-up
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
  -- Cancel any existing pending follow-ups for this conversation first
  UPDATE public.follow_up_queue
  SET status = 'cancelled', updated_at = now()
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
