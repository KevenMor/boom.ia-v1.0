-- Foto da ocorrência (URL pública, ex. Storage) + vínculo opcional a cliente (contacts)
ALTER TABLE public.occurrences
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_occurrences_contact ON public.occurrences(contact_id);

COMMENT ON COLUMN public.occurrences.photo_url IS 'URL pública da foto registada na ocorrência';
COMMENT ON COLUMN public.occurrences.contact_id IS 'Cliente (CRM) associado à ocorrência, opcional';
