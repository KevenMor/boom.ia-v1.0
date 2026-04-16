-- Várias fotos por ocorrência (URLs públicas); remove coluna única photo_url
ALTER TABLE public.occurrences
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'occurrences' AND column_name = 'photo_url'
  ) THEN
    UPDATE public.occurrences
    SET photo_urls = ARRAY[btrim(photo_url)]
    WHERE photo_url IS NOT NULL AND btrim(photo_url) <> '';
  END IF;
END $$;

ALTER TABLE public.occurrences DROP COLUMN IF EXISTS photo_url;

COMMENT ON COLUMN public.occurrences.photo_urls IS 'URLs públicas das fotos da ocorrência (ex. Storage), por ordem';
