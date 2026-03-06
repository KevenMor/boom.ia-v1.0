ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on appointment_reminders"
ON public.appointment_reminders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);