-- Motivo quando lembrete não foi enviado (cancelado ou falhou)
ALTER TABLE public.appointment_reminders
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

COMMENT ON COLUMN public.appointment_reminders.skip_reason IS 'Motivo quando não enviado: agent_inactive, reminder_disabled, no_delivery_channel, send_failed, duplicate, etc.';
