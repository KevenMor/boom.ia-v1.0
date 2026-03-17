-- Garantir que todo cancelamento tenha cancel_reason (evita "Motivo não registrado")
-- Se status = 'cancelled' e cancel_reason for null/vazio, define 'unknown'
CREATE OR REPLACE FUNCTION public.ensure_followup_cancel_reason()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (NEW.cancel_reason IS NULL OR TRIM(COALESCE(NEW.cancel_reason, '')) = '') THEN
    NEW.cancel_reason := 'unknown';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follow_up_queue_ensure_cancel_reason ON public.follow_up_queue;
CREATE TRIGGER trg_follow_up_queue_ensure_cancel_reason
  BEFORE UPDATE ON public.follow_up_queue
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled')
  EXECUTE FUNCTION ensure_followup_cancel_reason();
