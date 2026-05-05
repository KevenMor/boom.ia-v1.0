export const OCCURRENCE_LOCATION_TYPES = [
  "loja",
  "patio",
  "test_drive",
  "transporte",
  "oficina",
  "externo",
  "outro",
] as const;

export type OccurrenceLocationType = (typeof OCCURRENCE_LOCATION_TYPES)[number];

export const OCCURRENCE_LOCATION_LABELS: Record<OccurrenceLocationType, string> = {
  loja: "Loja / showroom",
  patio: "Pátio / exterior",
  test_drive: "Test-drive",
  transporte: "Transporte / reboque",
  oficina: "Oficina / mecânica",
  externo: "Local externo (cliente / via pública)",
  outro: "Outro (especificar)",
};
