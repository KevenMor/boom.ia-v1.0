-- Appointment reminders system
-- Stores scheduled reminders linked to calendar events

CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  calendar_event_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  chatwoot_conversation_id BIGINT,
  event_title TEXT NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_pending
  ON public.appointment_reminders (status, remind_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_event
  ON public.appointment_reminders (calendar_event_id);
