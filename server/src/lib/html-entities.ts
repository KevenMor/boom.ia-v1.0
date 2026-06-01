/**
 * Decodifica entidades HTML em texto vindo de scrapers/sites (&#225; → á, &amp; → &).
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: "\u00a0",
  copy: "®",
  reg: "®",
  aacute: "á",
  Aacute: "Á",
  acirc: "â",
  Acirc: "Â",
  agrave: "à",
  Agrave: "À",
  atilde: "ã",
  Atilde: "Ã",
  auml: "ä",
  Auml: "Ä",
  ccedil: "ç",
  Ccedil: "Ç",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  ordm: "º",
  ordf: "ª",
};

function decodeOnePass(s: string): string {
  return s
    .replace(/&#x([\da-fA-F]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Decodifica entidades HTML (numéricas, hex e nomeadas comuns em pt-BR). */
export function decodeHtmlEntities(s: string): string {
  if (!s || !/&(#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/.test(s)) return s;
  let out = s;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnePass(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

const INVENTORY_TEXT_FIELDS = [
  "brand",
  "model",
  "version",
  "color",
  "transmission",
  "fuel_type",
  "description",
] as const;

/** Normaliza campos de texto de um registro de inventário para exibição/API. */
export function decodeInventoryRecord<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const field of INVENTORY_TEXT_FIELDS) {
    const v = out[field];
    if (typeof v === "string" && v.includes("&")) {
      (out as Record<string, unknown>)[field] = decodeHtmlEntities(v);
    }
  }
  return out;
}
