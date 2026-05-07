-- Atualiza calendário do parque: day_kind aberto/fechado/manutenção;
-- event_label apenas promocional | evento | normal | NULL.

-- Etiquetas que não são dos novos valores deixam de ser guardadas (viram NULL).
UPDATE public.lodging_park_days
SET event_label = NULL
WHERE event_label IS NOT NULL
  AND event_label NOT IN ('promocional', 'evento', 'normal');

-- Migra valores antigos de tipo de dia.
UPDATE public.lodging_park_days
SET day_kind = 'aberto'
WHERE day_kind IN ('open_promotional', 'open_standard', 'special_event');

UPDATE public.lodging_park_days
SET day_kind = 'fechado'
WHERE day_kind = 'closed';

ALTER TABLE public.lodging_park_days DROP CONSTRAINT IF EXISTS lodging_park_days_day_kind_check;

ALTER TABLE public.lodging_park_days ADD CONSTRAINT lodging_park_days_day_kind_check
  CHECK (day_kind IN ('aberto', 'fechado', 'manutencao'));

ALTER TABLE public.lodging_park_days ALTER COLUMN day_kind SET DEFAULT 'aberto';

ALTER TABLE public.lodging_park_days DROP CONSTRAINT IF EXISTS lodging_park_days_event_label_check;

ALTER TABLE public.lodging_park_days ADD CONSTRAINT lodging_park_days_event_label_check
  CHECK (event_label IS NULL OR event_label IN ('promocional', 'evento', 'normal'));
