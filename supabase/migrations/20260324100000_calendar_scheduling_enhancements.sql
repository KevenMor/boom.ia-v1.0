-- Melhorias no Motor de Agendamento: working_hours, metadata index e auto-decrement de sessões

-- 1. Adicionar working_hours na tabela calendars (configuração por calendário)
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT NULL;

COMMENT ON COLUMN public.calendars.working_hours IS
  'Horários de funcionamento por dia (seg-dom). NULL usa fallback padrão (09:00-18:30 seg-sex, 09:00-13:00 sab). Schema: { "mon": { "enabled": bool, "start": "HH:MM", "end": "HH:MM" }, ... }';

-- 2. Adicionar metadata em calendar_events se não existir
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- 3. Índice GIN para queries eficientes em metadata
CREATE INDEX IF NOT EXISTS idx_calendar_events_metadata
  ON public.calendar_events USING GIN (metadata jsonb_path_ops)
  WHERE metadata IS NOT NULL;

-- 4. Trigger: decrementa sessions_used automaticamente ao criar/linkar evento com contato
CREATE OR REPLACE FUNCTION public.auto_decrement_package_sessions()
RETURNS TRIGGER AS $$
DECLARE
  v_package_id UUID;
BEGIN
  -- Se contact_id é NULL, nada fazer
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se é UPDATE e contact_id não mudou, nada fazer
  IF TG_OP = 'UPDATE' AND OLD.contact_id = NEW.contact_id THEN
    RETURN NEW;
  END IF;

  -- Encontrar o pacote ativo mais antigo do contato com sessões restantes
  SELECT id INTO v_package_id
  FROM public.contact_packages
  WHERE contact_id = NEW.contact_id
    AND tenant_id = NEW.tenant_id
    AND status = 'active'
    AND (sessions_total IS NULL OR sessions_used < sessions_total)
  ORDER BY created_at ASC
  LIMIT 1;

  -- Decrementar sessions_used se encontrou pacote
  IF v_package_id IS NOT NULL THEN
    UPDATE public.contact_packages
    SET sessions_used = sessions_used + 1,
        updated_at = now()
    WHERE id = v_package_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger (drop se existir)
DROP TRIGGER IF EXISTS trg_calendar_event_decrement_sessions ON public.calendar_events;
CREATE TRIGGER trg_calendar_event_decrement_sessions
  AFTER INSERT OR UPDATE OF contact_id ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_decrement_package_sessions();

-- 5. Trigger: incrementa sessions_used automaticamente ao deletar evento (desfaz o decremento)
CREATE OR REPLACE FUNCTION public.auto_increment_package_sessions_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_package_id UUID;
BEGIN
  -- Se contact_id é NULL, nada fazer
  IF OLD.contact_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Encontrar o pacote ativo mais recentemente atualizado com sessions_used > 0
  SELECT id INTO v_package_id
  FROM public.contact_packages
  WHERE contact_id = OLD.contact_id
    AND tenant_id = OLD.tenant_id
    AND status = 'active'
    AND sessions_used > 0
  ORDER BY updated_at DESC  -- mais recentemente decrementado
  LIMIT 1;

  -- Incrementar sessions_used se encontrou pacote
  IF v_package_id IS NOT NULL THEN
    UPDATE public.contact_packages
    SET sessions_used = sessions_used - 1,
        updated_at = now()
    WHERE id = v_package_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger (drop se existir)
DROP TRIGGER IF EXISTS trg_calendar_event_restore_sessions ON public.calendar_events;
CREATE TRIGGER trg_calendar_event_restore_sessions
  AFTER DELETE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_increment_package_sessions_on_cancel();
