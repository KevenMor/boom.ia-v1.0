-- Reverte o +3h aplicado em calendar_events pela migração anterior (que corrigia só lembretes).
-- O calendário já estava certo; esta migração desfaz o ajuste indevido em calendar_events.
-- Só executar se você rodou a 20260310120000 antes da correção que deixou de alterar calendar_events.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_events' AND column_name = 'timezone_corrected'
  ) THEN
    UPDATE calendar_events
    SET
      start_at = start_at - interval '3 hours',
      end_at = end_at - interval '3 hours',
      timezone_corrected = false
    WHERE timezone_corrected = true;

    ALTER TABLE calendar_events DROP COLUMN IF EXISTS timezone_corrected;
  END IF;
END $$;
