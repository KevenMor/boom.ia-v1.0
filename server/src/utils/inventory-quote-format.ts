/**
 * Guard de entrega para consultar_estoque / inventory_query.
 * Corrige preço, km, modelo, cor e câmbio alucinados pelo LLM com os dados reais da tool.
 */

export type InventoryVehicleSnapshot = {
  id?: string;
  nome_completo?: string;
  marca?: string;
  modelo?: string;
  versao?: string;
  ano?: number;
  preco?: number;
  preco_formatado?: string;
  km?: number;
  cor?: string;
  cambio?: string;
};

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatKmBR(km: number): string {
  return `${km.toLocaleString("pt-BR")} km`;
}

function parsePriceToNumber(raw: string): number | null {
  const cleaned = raw.replace(/R\$\s*/i, "").trim();
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const [intPart, dec] = cleaned.split(",");
    const n = Number(intPart.replace(/\./g, "") + "." + (dec ?? "00").slice(0, 2));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned.replace(/\./g, "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseKmToNumber(raw: string): number | null {
  const n = Number(String(raw).replace(/\./g, "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

export function parseInventoryVehiclesFromToolResults(
  toolResultStrings: string[],
): InventoryVehicleSnapshot[] {
  const out: InventoryVehicleSnapshot[] = [];
  for (const raw of toolResultStrings) {
    if (!raw || typeof raw !== "string") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;
    const vehicles = (obj as { vehicles?: unknown }).vehicles;
    if (!Array.isArray(vehicles)) continue;
    for (const v of vehicles) {
      if (!v || typeof v !== "object") continue;
      const row = v as Record<string, unknown>;
      out.push({
        id: typeof row.id === "string" ? row.id : undefined,
        nome_completo: typeof row.nome_completo === "string" ? row.nome_completo : undefined,
        marca: typeof row.marca === "string" ? row.marca : undefined,
        modelo: typeof row.modelo === "string" ? row.modelo : undefined,
        versao: typeof row.versao === "string" ? row.versao : undefined,
        ano: typeof row.ano === "number" ? row.ano : undefined,
        preco: typeof row.preco === "number" ? row.preco : undefined,
        preco_formatado: typeof row.preco_formatado === "string" ? row.preco_formatado : undefined,
        km: typeof row.km === "number" ? row.km : undefined,
        cor: typeof row.cor === "string" ? row.cor : undefined,
        cambio: typeof row.cambio === "string" ? row.cambio : undefined,
      });
    }
  }
  return out;
}

function vehicleDisplayName(v: InventoryVehicleSnapshot): string {
  if (v.nome_completo?.trim()) return v.nome_completo.trim();
  return [v.marca, v.modelo, v.versao, v.ano].filter(Boolean).join(" ").trim();
}

function vehiclePriceLabel(v: InventoryVehicleSnapshot): string | undefined {
  if (v.preco_formatado?.trim()) return v.preco_formatado.trim();
  if (v.preco != null) return formatCurrencyBR(v.preco);
  return undefined;
}

function extractPricesFromText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/R\$\s*[\d.]+(?:,\d{2})?/gi)) {
    const n = parsePriceToNumber(m[0]);
    if (n != null) out.push(n);
  }
  return out;
}

function extractKmsFromText(text: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (n: number | null) => {
    if (n == null || n < 100) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const m of text.matchAll(/(?:quilometragem)\s*[:.]?\s*([\d.]+)/gi)) {
    push(parseKmToNumber(m[1] ?? ""));
  }
  for (const m of text.matchAll(/\b([\d.]+)\s*km\b/gi)) {
    push(parseKmToNumber(m[1] ?? ""));
  }
  return out;
}

/** True se o texto cita preço/km que não batem com nenhum veículo do estoque. */
export function inventoryQuoteLooksHallucinated(
  assistantText: string,
  vehicles: InventoryVehicleSnapshot[],
): boolean {
  if (!assistantText?.trim() || vehicles.length === 0) return false;

  const validToolPrices = vehicles.map((v) => v.preco).filter((p): p is number => p != null);
  for (const p of extractPricesFromText(assistantText)) {
    if (validToolPrices.length > 0 && !validToolPrices.some((tp) => pricesMatch(p, tp))) {
      return true;
    }
  }

  const toolKms = vehicles.map((v) => v.km).filter((k): k is number => k != null);
  for (const k of extractKmsFromText(assistantText)) {
    if (toolKms.length > 0 && !toolKms.includes(k)) return true;
  }

  return false;
}

function buildCanonicalFactsBlock(v: InventoryVehicleSnapshot): string {
  const lines: string[] = [];
  const name = vehicleDisplayName(v);
  if (name) lines.push(name);
  const price = vehiclePriceLabel(v);
  if (price) lines.push(`Preço: ${price}`);
  if (v.km != null) lines.push(`Quilometragem: ${formatKmBR(v.km)}`);
  if (v.cor) lines.push(`Cor: ${v.cor}`);
  if (v.cambio) lines.push(`Câmbio: ${v.cambio}`);
  return lines.join("\n");
}

/**
 * Detecta bloco factual típico (título + Preço/km/cor/câmbio) e substitui pelo canônico.
 * Se não achar bloco, aplica replaces cirúrgicos em preço/km/cor/câmbio.
 */
function repairHallucinatedInventoryText(
  text: string,
  v: InventoryVehicleSnapshot,
): string {
  const facts = buildCanonicalFactsBlock(v);
  const priceLabel = vehiclePriceLabel(v);
  const display = vehicleDisplayName(v);

  // Bloco estruturado: linha de modelo + Preço + Quilometragem (+ Cor/Câmbio)
  const blockRe =
    /(?:^|\n)([^\n]*(?:Maverick|Onix|Corolla|Civic|Hilux|S10|Tracker|Compass|Renegade|Mercedes|BMW|Audi|Golf|Polo|T-Cross|Creta|HB20|Strada|Toro|Ranger|Amarok)[^\n]*)\n+Pre[cç]o\s*:[^\n]+\n+(?:Quilometragem\s*:[^\n]+\n+)?(?:Cor\s*:[^\n]+\n+)?(?:C[aâ]mbio\s*:[^\n]+\n?)?/i;

  if (blockRe.test(text) && facts) {
    return text.replace(blockRe, (match) => {
      const prefix = match.startsWith("\n") ? "\n" : "";
      return `${prefix}${facts}\n`;
    });
  }

  let out = text;

  if (priceLabel) {
    out = out.replace(/R\$\s*[\d.]+(?:,\d{2})?/gi, priceLabel);
  }

  if (v.km != null) {
    const kmLabel = formatKmBR(v.km);
    out = out.replace(/(Quilometragem\s*:\s*)([\d.]+)(\s*km)?/gi, `$1${kmLabel}`);
    out = out.replace(/\b([\d.]+)\s*km\b/gi, (full, raw: string) => {
      const n = parseKmToNumber(raw);
      if (n == null || n === v.km) return full;
      // Não trocar km que já é o correto; trocar só divergentes
      if (n !== v.km) return kmLabel;
      return full;
    });
  }

  if (v.cor) {
    out = out.replace(/(Cor\s*:\s*)([^\n]+)/i, `$1${v.cor}`);
  }
  if (v.cambio) {
    out = out.replace(/(C[aâ]mbio\s*:\s*)([^\n]+)/i, `$1${v.cambio}`);
  }

  // Só troca linhas que parecem título de veículo (curtas, sem prosa conversacional)
  if (display) {
    out = out.replace(
      /^([^\n]{8,90})$/gim,
      (line) => {
        const t = line.trim();
        if (/\b(valor|unidade|loja|passei|temos|quero|mande|fotos|prazer|olha)\b/i.test(t)) {
          return line;
        }
        if (
          !/(?:Maverick|Onix|Corolla|Civic|Hilux|S10|Tracker|Compass|Lariat|EcoBoost|Hybrid)/i.test(
            t,
          )
        ) {
          return line;
        }
        // Título típico: poucas palavras, sem pontuação conversacional longa
        if (/[,?]/.test(t) || (t.match(/\s+/g) || []).length > 10) return line;
        return display;
      },
    );
  }

  // Ainda alucinado? injeta bloco canônico antes do CTA de fotos / no fim
  if (inventoryQuoteLooksHallucinated(out, [v])) {
    const ctaRe =
      /(quer(?:\s+que)?\s+(?:eu\s+)?(?:te\s+)?(?:mand(?:e|ar)|envi(?:e|ar)|ver).{0,60}fotos[^\n]*)/i;
    if (ctaRe.test(out)) {
      out = out.replace(ctaRe, `${facts}\n\n$1`);
    } else {
      out = `${out.trim()}\n\n${facts}`;
    }
  }

  return out;
}

/**
 * Substitui specs alucinadas pelos dados da tool.
 * Preserva saudação/CTA; corrige só os fatos do estoque.
 */
export function formatInventoryQuoteForDelivery(
  assistantText: string,
  toolResultStrings: string[],
): string {
  const base = (assistantText ?? "").trim();
  if (!base) return assistantText ?? "";

  const vehicles = parseInventoryVehiclesFromToolResults(toolResultStrings);
  if (vehicles.length === 0) return base;
  if (!inventoryQuoteLooksHallucinated(base, vehicles)) return base;

  const v = vehicles[0];
  const repaired = repairHallucinatedInventoryText(base, v);

  console.log("[inventory-quote] Corrigindo specs alucinadas com dados do estoque:", {
    vehicle: vehicleDisplayName(v),
    price: vehiclePriceLabel(v),
    km: v.km,
  });

  return repaired;
}

/**
 * True quando a última msg do user parece só um nome e há veículo citado antes —
 * usado para forçar consultar_estoque no 2º turno (anti-alucinação).
 */
export function shouldForceInventoryAfterNameCapture(messages: Array<{ role: string; content?: string }>): {
  force: boolean;
  marca?: string;
  modelo?: string;
  ano?: number;
} {
  const userMsgs = messages.filter((m) => m.role === "user");
  if (userMsgs.length < 2) return { force: false };

  const last = (userMsgs[userMsgs.length - 1]?.content || "").trim();
  const normalizedUser = last
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const looksLikeOnlyName = /^\s*(me\s+chamo\s+)?([a-z]{2,})(\s+[a-z]{2,}){0,3}\s*$/i.test(
    normalizedUser,
  );
  if (!looksLikeOnlyName) return { force: false };

  // Reusa heurística leve de marca/modelo no histórico anterior
  const BRANDS = [
    "ford",
    "chevrolet",
    "vw",
    "volkswagen",
    "fiat",
    "toyota",
    "honda",
    "hyundai",
    "jeep",
    "nissan",
    "renault",
    "bmw",
    "mercedes",
    "audi",
    "byd",
    "ram",
  ];

  for (let i = userMsgs.length - 2; i >= 0; i--) {
    const content = userMsgs[i]?.content || "";
    const lower = content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const brand of BRANDS) {
      const idx = lower.indexOf(brand);
      if (idx === -1) continue;
      const after = content.slice(idx + brand.length).trim();
      const modelMatch = after.match(/^[\s]*([A-Za-z\u00C0-\u00FF0-9]+(?:[\s]+[A-Za-z\u00C0-\u00FF0-9]+)?)/i);
      let modelo: string | undefined;
      if (modelMatch) {
        const raw = modelMatch[1].trim();
        if (!/^(19|20)\d{2}$/.test(raw) && raw.length > 1) modelo = raw;
      }
      const yearMatch = content.match(/\b(19\d{2}|20[0-3]\d)\b/);
      const marca =
        brand === "vw"
          ? "Volkswagen"
          : brand.charAt(0).toUpperCase() + brand.slice(1);
      return {
        force: true,
        marca,
        modelo,
        ano: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
      };
    }
  }

  return { force: false };
}
