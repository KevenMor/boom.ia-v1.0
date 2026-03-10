-- Corrige APENAS horários dos LEMBRETES (appointment_reminders).
-- O calendário (calendar_events) já estava correto; não alterar.
-- Registros antigos tinham event_start_at/remind_at gravados como UTC quando era horário de Brasília.
-- Soma 3 horas para que 14:00 UTC vire 17:00 UTC (= 14:00 BRT na exibição).
-- timezone_corrected evita aplicar +3h duas vezes.

ALTER TABLE appointment_reminders
  ADD COLUMN IF NOT EXISTS timezone_corrected boolean DEFAULT false;

UPDATE appointment_reminders
SET
  event_start_at = event_start_at + interval '3 hours',
  remind_at = remind_at + interval '3 hours',
  timezone_corrected = true
WHERE created_at < '2026-03-10 02:00:00+00'
  AND (timezone_corrected IS NULL OR timezone_corrected = false);
