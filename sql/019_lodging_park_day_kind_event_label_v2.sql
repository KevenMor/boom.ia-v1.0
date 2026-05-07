-- Aplicar após 018 se a tabela já existir com tipos antigos.
-- Equivalente a supabase/migrations/20260507140000_lodging_park_day_kind_event_label_v2.sql

UPDATE public.lodging_park_days
SET event_label = NULL
WHERE event_label IS NOT NULL
  AND event_label NOT IN ('promocional', 'evento', 'normal');

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
