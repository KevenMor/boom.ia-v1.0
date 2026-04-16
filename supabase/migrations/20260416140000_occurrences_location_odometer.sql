-- Local da ocorrência + quilometragem no momento do registo
ALTER TABLE public.occurrences
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'loja'
    CHECK (location_type IN (
      'loja',
      'patio',
      'test_drive',
      'transporte',
      'oficina',
      'externo',
      'outro'
    )),
  ADD COLUMN IF NOT EXISTS location_detail text,
  ADD COLUMN IF NOT EXISTS odometer_km integer
    CHECK (odometer_km IS NULL OR odometer_km >= 0);

COMMENT ON COLUMN public.occurrences.location_detail IS 'Detalhe opcional (ex.: morada, nome do local) — obrigatório na UI quando location_type = outro';
