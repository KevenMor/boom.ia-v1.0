/**
 * Classificação automática de veículos por segmento/estilo.
 * Usada no consultar_estoque para filtrar "esportivo", "suv", etc.
 */

export type VehicleSegment =
  | "esportivo"
  | "premium"
  | "suv"
  | "picape"
  | "sedan"
  | "hatch"
  | "hibrido"
  | "eletrico";

export interface VehicleSegmentInput {
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  description?: string | null;
  fuel_type?: string | null;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function haystack(v: VehicleSegmentInput): string {
  return normalize([v.brand, v.model, v.version, v.description, v.fuel_type].filter(Boolean).join(" "));
}

const SPORT_BRANDS = new Set([
  "porsche",
  "ferrari",
  "lamborghini",
  "mclaren",
  "aston martin",
  "maserati",
  "lotus",
  "pagani",
  "bugatti",
  "alpina",
]);

const PREMIUM_BRANDS = new Set([
  ...SPORT_BRANDS,
  "bmw",
  "mercedes",
  "mercedes-benz",
  "audi",
  "land rover",
  "jaguar",
  "lexus",
  "volvo",
  "cadillac",
  "infiniti",
  "genesis",
]);

const SPORT_TEXT_HINTS = [
  "turbo s",
  "turbo gts",
  " gts",
  " gt3",
  " gt4",
  " amg",
  "competition",
  "performance",
  "type r",
  "type-r",
  "type s",
  "type-s",
  "john cooper",
  "cooper s",
  "golf gti",
  "golf r",
  "jetta gli",
  "focus st",
  "focus rs",
  "civic si",
  "si ",
  "brz",
  "gr86",
  "supra",
  "corvette",
  "camaro",
  "mustang gt",
  " shelby",
  "nismo",
  "rs3",
  "rs4",
  "rs5",
  "rs6",
  "rs7",
  " m3",
  " m4",
  " m5",
  " m6",
  " m2",
  " s3",
  " s4",
  " s5",
  " s6",
  "v8",
  "v10",
  "v12",
  "coupe",
  "roadster",
  "cabrio",
  "spider",
  "esportiv",
  "sport",
];

const SUV_HINTS = [
  " suv",
  "crossover",
  "utilitario esportivo",
  "creta",
  "tracker",
  "compass",
  "renegade",
  "tiguan",
  "tucson",
  "sportage",
  "kicks",
  "hr-v",
  "t-cross",
  "commander",
  "outlander",
  "cayenne",
  "macan",
  "x1",
  "x3",
  "x5",
  "x6",
  "q3",
  "q5",
  "q7",
  "q8",
  "glc",
  "gle",
  "gla",
  "equinox",
  "trailblazer",
  "tiggo",
  "haval h6",
  "duster",
  "captur",
  "ecosport",
  "troller",
];

const PICKUP_HINTS = [
  "picape",
  "pickup",
  "camionete",
  "caminhonete",
  "hilux",
  "ranger",
  "s10",
  "amarok",
  "toro",
  "frontier",
  "strada",
  "saveiro",
  "l200",
  "montana",
  "maverick",
  "oroch",
  "sw4",
];

const SEDAN_HINTS = [" sedan", "corolla", "civic", "jetta", "virtus", "cruze", "onix plus", "city", "a3 sedan", "320i", "c180", "c200"];
const HATCH_HINTS = [" hatch", "onix", "hb20", "polo", "gol", "argo", "mobi", "kwid", "sandero", "fit", "208", "i30"];

/** Mapeia termos do cliente/dispatcher para segmento canônico. */
export const SEGMENT_FILTER_ALIASES: Record<string, VehicleSegment> = {
  esportivo: "esportivo",
  esportiva: "esportivo",
  sport: "esportivo",
  performance: "esportivo",
  "pegada esportiva": "esportivo",
  "mais esportivo": "esportivo",
  "carro esportivo": "esportivo",
  premium: "premium",
  luxo: "premium",
  luxuoso: "premium",
  executivo: "premium",
  suv: "suv",
  crossover: "suv",
  picape: "picape",
  pickup: "picape",
  camionete: "picape",
  caminhonete: "picape",
  sedan: "sedan",
  hatch: "hatch",
  hibrido: "hibrido",
  hybrid: "hibrido",
  eletrico: "eletrico",
  electric: "eletrico",
};

export function resolveSegmentFilter(raw: string | undefined): VehicleSegment | null {
  if (!raw?.trim()) return null;
  const norm = normalize(raw);
  if (SEGMENT_FILTER_ALIASES[norm]) return SEGMENT_FILTER_ALIASES[norm];
  for (const [alias, segment] of Object.entries(SEGMENT_FILTER_ALIASES)) {
    if (norm.includes(alias)) return segment;
  }
  return null;
}

function includesAny(hay: string, hints: string[]): boolean {
  return hints.some((h) => hay.includes(h.trim()) || hay.includes(h.trim().replace(/^\s+/, "")));
}

export function classifyVehicleSegments(v: VehicleSegmentInput): VehicleSegment[] {
  const segments = new Set<VehicleSegment>();
  const hay = haystack(v);
  const brandNorm = normalize(v.brand || "");

  if (includesAny(hay, PICKUP_HINTS)) segments.add("picape");
  if (includesAny(hay, SUV_HINTS) || /\bsuv\b/.test(hay)) segments.add("suv");
  if (includesAny(hay, SEDAN_HINTS)) segments.add("sedan");
  if (includesAny(hay, HATCH_HINTS)) segments.add("hatch");

  if (SPORT_BRANDS.has(brandNorm) || includesAny(hay, SPORT_TEXT_HINTS)) {
    segments.add("esportivo");
  }
  if (PREMIUM_BRANDS.has(brandNorm)) {
    segments.add("premium");
  }
  if (/porsche|panamera|911|cayman|boxster|turbo s|turbo gts/.test(hay)) {
    segments.add("esportivo");
    segments.add("premium");
  }

  if (/hibrid|hybrid|phev|e-hybrid|e hybrid/.test(hay)) segments.add("hibrido");
  if (/eletric|electric|\bev\b|bev|100% ele/.test(hay)) segments.add("eletrico");

  return [...segments];
}

export function vehicleMatchesSegment(v: VehicleSegmentInput, segment: VehicleSegment): boolean {
  return classifyVehicleSegments(v).includes(segment);
}

export const SEGMENT_STYLE_KEYWORDS = Object.keys(SEGMENT_FILTER_ALIASES);
