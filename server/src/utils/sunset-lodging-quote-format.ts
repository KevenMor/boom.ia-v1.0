/**
 * Formata orçamentos Sunset (hospedagem) para WhatsApp: uma bolha por acomodação
 * (foto da galeria + linha de preço), depois rodapé com incluso/horários/pagamento.
 */

import {
  collectSunsetLodgingGalleryPhotosFromToolResults,
  lodgingAccommodationDisplayLabel,
  shouldIncludeSunsetLodgingPhotoInQuote,
  type SunsetLodgingGalleryPhoto,
} from "./sunset-lodging-gallery-photos.js";
import {
  extractLodgingQuoteClosingQuestion,
  polishSunsetLodgingQuoteReadableText,
} from "./sunset-lodging-quote-layout.js";
import {
  messageDeclaresPostLodgingQuoteClarification,
  userMessageIsPhotoRequestOnly,
} from "./sunset-lodging-params.js";

const MSG_SPLIT = "<<MSG_SPLIT>>";
const IMAGE_MD_RE = /^!\[[^\]]*\]\(https?:\/\/[^)\s]+\)\s*$/i;
const LODGING_QUOTE_RE = /\bR\$\s*[\d.,]+/;
const FOOTER_SECTION_RE = /^\*(Incluso|Horários|Horarios|Pagamento)\b/i;
const OPCOES_SECTION_RE = /^\*Op[cç][õo]es\*/i;

function normalizeKey(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function assistantDeliversLodgingQuote(text: string): boolean {
  const t = text || "";
  if (!LODGING_QUOTE_RE.test(t)) return false;
  const priceCount = t.match(/R\$\s*[\d.,]+/g)?.length ?? 0;
  return (
    OPCOES_SECTION_RE.test(t) ||
    /Segue o orçamento|orçamento solicitado|pacote de \d+ noite/i.test(t) ||
    priceCount >= 1
  );
}

/** Exportado para runtime (bloquear re-cotação em dúvidas de amenidade). */
export function assistantMessageDeliversLodgingQuote(text: string): boolean {
  return assistantDeliversLodgingQuote(text);
}

/** Reconstrói orçamento da tool só quando a resposta é (ou deveria ser) cotação — não em FAQ. */
export function shouldRebuildSunsetQuoteFromTool(
  assistantText: string,
  toolPayload: { accommodations: Array<{ name?: string }> } | null,
  opts?: { lastUserMessage?: string }
): boolean {
  if (!toolPayload) return false;
  if (opts?.lastUserMessage && userMessageIsPhotoRequestOnly(opts.lastUserMessage)) {
    return false;
  }
  if (
    opts?.lastUserMessage &&
    messageDeclaresPostLodgingQuoteClarification(opts.lastUserMessage)
  ) {
    return false;
  }
  const base = (assistantText ?? "").trim();
  if (!base) return true;
  if (assistantDeliversLodgingQuote(base)) {
    const priceCount = base.match(/R\$\s*[\d.,]+/g)?.length ?? 0;
    const accCount = toolPayload.accommodations.length;
    // Sempre rebuild se faltou qualquer categoria da tool (anti-omissão).
    if (accCount > 0 && priceCount < accCount) return true;
    return true;
  }
  const priceCount = base.match(/R\$\s*[\d.,]+/g)?.length ?? 0;
  const accCount = toolPayload.accommodations.length;
  if (
    /orçamento|orcamento|pacote|valores abaixo|op[cç][õo]es|próxima op[cç][ãa]o|proxima opcao/i.test(base) &&
    accCount > 0 &&
    priceCount < accCount
  ) {
    return true;
  }
  return false;
}

export function isSunsetLodgingQuoteContext(
  assistantText: string,
  toolResultStrings: string[]
): boolean {
  return (
    assistantDeliversLodgingQuote(assistantText) ||
    collectSunsetLodgingGalleryPhotosFromToolResults(toolResultStrings).length > 0
  );
}

function lineIsImageOnly(line: string): boolean {
  return IMAGE_MD_RE.test(line.trim());
}

/** Linha de preço de acomodação — com ou sem negrito WhatsApp. */
function lineLooksLikePriceOption(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || lineIsImageOnly(trimmed)) return false;
  if (!LODGING_QUOTE_RE.test(trimmed)) return false;
  if (FOOTER_SECTION_RE.test(trimmed)) return false;
  if (OPCOES_SECTION_RE.test(trimmed)) return false;
  if (/\*[^*]+\*/.test(trimmed)) return true;
  if (/^[A-Za-zÀ-ú][\wÀ-ú\s]*\s*[—–-]\s*R\$/i.test(trimmed)) return true;
  return false;
}

function lineLooksLikeLodgingQuote(line: string, displayLabel: string): boolean {
  const normLine = normalizeKey(line.replace(/\*/g, ""));
  const normLabel = normalizeKey(displayLabel);
  if (!normLabel || !normLine.includes(normLabel)) return false;
  return LODGING_QUOTE_RE.test(line);
}

type LodgingToolPayload = {
  nights: number;
  accommodations: Array<{
    name?: string;
    total_price?: number;
    nights?: number;
    rooms_count?: number;
    quoted_for_occupancy?: number;
  }>;
  galleryPhotos: SunsetLodgingGalleryPhoto[];
  guestsInFamily?: number;
  guestsForPricing?: number;
  kidsUnder12?: Array<{ age: number }>;
  roomsInQuote?: number;
  hasPromotion?: boolean;
};

function buildSunsetLodgingQuoteIntroFromTool(payload: LodgingToolPayload): string {
  const groupSize = payload.guestsInFamily ?? payload.guestsForPricing;
  const rooms = payload.roomsInQuote ?? payload.accommodations[0]?.rooms_count ?? 1;
  if (groupSize == null) return "";

  const promoLine = payload.hasPromotion
    ? " Os valores já incluem 25% OFF e o pacote fechado (pernoite + jantar + café + acesso ao parque)."
    : " Cada valor abaixo é o total do pacote para o grupo.";

  if (rooms > 1) {
    return `Como vocês são ${groupSize}, organizamos em ${rooms} quartos — cada opção abaixo traz o total do pacote para o grupo.${promoLine}`;
  }
  return `Segue o orçamento para ${groupSize} pessoa${groupSize === 1 ? "" : "s"}.${promoLine}`;
}

/** Quebra parágrafo denso (*Chalé* — R$ … *Suíte* — R$) em bolhas MSG_SPLIT. */
function splitDenseLodgingQuoteParagraph(text: string): string {
  if (!text || text.includes(MSG_SPLIT)) return text;
  const optionStarts = [...text.matchAll(/\*[^*]+?\*\s*[—–-]\s*R\$/g)];
  if (optionStarts.length < 2) return text;

  const parts: string[] = [];
  const introEnd = optionStarts[0].index ?? 0;
  if (introEnd > 0) {
    const intro = text.slice(0, introEnd).trim();
    if (intro) parts.push(polishSunsetLodgingQuoteReadableText(intro));
  }

  for (let i = 0; i < optionStarts.length; i++) {
    const start = optionStarts[i].index ?? 0;
    const end = i + 1 < optionStarts.length ? (optionStarts[i + 1].index ?? text.length) : text.length;
    const chunk = text.slice(start, end).trim();
    if (chunk) parts.push(chunk);
  }

  if (parts.length <= 1) return text;
  return parts.join(`\n${MSG_SPLIT}\n`);
}

function ensureSunsetLodgingQuoteMessageSplits(text: string): string {
  if (!text || text.includes(MSG_SPLIT)) return text;
  let split = insertSunsetLodgingMessageSplits(text);
  if (split.includes(MSG_SPLIT)) return split;
  split = splitDenseLodgingQuoteParagraph(text);
  return split;
}

function formatLodgingOptionPriceLine(
  acc: LodgingToolPayload["accommodations"][number],
  displayLabel: string,
  defaultNights: number,
): string {
  if (acc.total_price == null) return "";
  const nights = acc.nights ?? defaultNights;
  const nightsLabel = nights === 1 ? "1 noite" : `${nights} noites`;
  const rooms = acc.rooms_count ?? 1;
  const roomsSuffix = rooms > 1 ? ` — total do grupo (${rooms} unidades)` : "";
  const occupancySuffix =
    acc.quoted_for_occupancy != null && rooms <= 1
      ? ` (tarifa até ${acc.quoted_for_occupancy} pessoas; confirmar condição com a equipe se o grupo for maior)`
      : "";
  return `*${displayLabel}* — ${formatCurrencyBR(acc.total_price)} o pacote de ${nightsLabel}${roomsSuffix}${occupancySuffix}`;
}

function parseLodgingToolPayload(toolResultStrings: string[]): LodgingToolPayload | null {
  let accommodations: LodgingToolPayload["accommodations"] = [];
  let nights = 1;
  const galleryPhotos: SunsetLodgingGalleryPhoto[] = [];
  const seenPhotoUrls = new Set<string>();
  const meta: Pick<
    LodgingToolPayload,
    "guestsInFamily" | "guestsForPricing" | "kidsUnder12" | "roomsInQuote" | "hasPromotion"
  > = {};

  const pushPhoto = (p: SunsetLodgingGalleryPhoto | undefined) => {
    if (!p?.imageUrl || !p?.photoMarkdown) return;
    if (seenPhotoUrls.has(p.imageUrl)) return;
    seenPhotoUrls.add(p.imageUrl);
    galleryPhotos.push(p);
  };

  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as {
        nights?: number;
        guests_in_family?: number;
        guests_for_pricing?: number;
        kids_under_12?: Array<{ age: number }>;
        rooms_in_quote?: number;
        promotion?: unknown;
        available_accommodations?: LodgingToolPayload["accommodations"];
        gallery_photos?: SunsetLodgingGalleryPhoto[];
      };
      if (typeof parsed.nights === "number" && parsed.nights > 0) {
        nights = parsed.nights;
      }
      if (typeof parsed.guests_in_family === "number") {
        meta.guestsInFamily = parsed.guests_in_family;
      }
      if (typeof parsed.guests_for_pricing === "number") {
        meta.guestsForPricing = parsed.guests_for_pricing;
      }
      if (Array.isArray(parsed.kids_under_12)) {
        meta.kidsUnder12 = parsed.kids_under_12;
      }
      if (typeof parsed.rooms_in_quote === "number") {
        meta.roomsInQuote = parsed.rooms_in_quote;
      }
      if (parsed.promotion) {
        meta.hasPromotion = true;
      }
      if (Array.isArray(parsed.available_accommodations) && parsed.available_accommodations.length > 0) {
        accommodations = parsed.available_accommodations;
      }
      if (Array.isArray(parsed.gallery_photos)) {
        for (const p of parsed.gallery_photos) pushPhoto(p);
      }
    } catch {
      /* ignore */
    }
  }

  for (const p of collectSunsetLodgingGalleryPhotosFromToolResults(toolResultStrings)) {
    pushPhoto(p);
  }

  // Accommodation sozinho (sem fotos) é válido quando o toggle de orçamento sem foto
  // está ativo (`SUNSET_LODGING_SEND_PHOTOS_WITH_QUOTE = false`). O caller trata `galleryPhotos=[]`
  // como modo "só texto" — vide `rebuildSunsetLodgingQuoteFromTool`.
  if (accommodations.length === 0) return null;
  return { nights, accommodations, galleryPhotos, ...meta };
}

function photoForAccommodation(
  accName: string,
  photos: SunsetLodgingGalleryPhoto[]
): SunsetLodgingGalleryPhoto | undefined {
  const key = normalizeKey(accName);
  const display = normalizeKey(lodgingAccommodationDisplayLabel(accName));

  const exact = photos.find((p) => normalizeKey(p.accommodationName) === key);
  if (exact) return exact;

  const byDisplay = photos.find((p) => normalizeKey(p.displayLabel) === display);
  if (byDisplay) return byDisplay;

  const fuzzy = photos.find((p) => {
    const accKey = normalizeKey(p.accommodationName);
    const labelKey = normalizeKey(p.displayLabel);
    const galleryKey = normalizeKey(p.galleryName || "");
    return (
      accKey.includes(key) ||
      key.includes(accKey) ||
      labelKey.includes(display) ||
      display.includes(labelKey) ||
      galleryKey.includes(display) ||
      display.includes(galleryKey)
    );
  });
  if (fuzzy) return fuzzy;

  return undefined;
}

function buildPhotoAssignments(
  accommodations: Array<{ name?: string; total_price?: number }>,
  galleryPhotos: SunsetLodgingGalleryPhoto[]
): Map<string, SunsetLodgingGalleryPhoto> {
  const sorted = [...accommodations].sort((a, b) => (a.total_price ?? 0) - (b.total_price ?? 0));
  const assignments = new Map<string, SunsetLodgingGalleryPhoto>();
  const usedUrls = new Set<string>();

  for (const acc of sorted) {
    const accName = String(acc.name ?? "").trim();
    if (!accName) continue;
    const available = galleryPhotos.filter((p) => !usedUrls.has(p.imageUrl));
    const photo = photoForAccommodation(accName, available);
    if (!photo) continue;
    assignments.set(accName, photo);
    usedUrls.add(photo.imageUrl);
  }

  // Fallback por posição: cobre o caso em que fuzzy match falha (label diverge do nome)
  // mas a tool devolveu o mesmo nº de acomodações e fotos. Ordena por preço + atribui índice.
  if (assignments.size < sorted.length) {
    const stillMissing = sorted.filter((acc) => {
      const n = String(acc.name ?? "").trim();
      return n && !assignments.has(n);
    });
    const remainingPhotos = galleryPhotos.filter((p) => !usedUrls.has(p.imageUrl));
    if (stillMissing.length > 0 && stillMissing.length <= remainingPhotos.length) {
      stillMissing.forEach((acc, idx) => {
        const accName = String(acc.name ?? "").trim();
        const photo = remainingPhotos[idx];
        if (accName && photo) {
          assignments.set(accName, photo);
          usedUrls.add(photo.imageUrl);
        }
      });
    }
  }

  return assignments;
}

function normalizePriceLine(line: string, displayLabel: string): string {
  const trimmed = line.trim();
  const priceMatch = trimmed.match(/\bR\$\s*[\d.,]+/);
  if (!priceMatch) return trimmed;
  if (/\*[^*]+\*/.test(trimmed)) return trimmed;
  return `*${displayLabel}* — ${priceMatch[0]}`;
}

function findPriceLineForAccommodation(
  text: string,
  photo: SunsetLodgingGalleryPhoto,
  accName: string
): string {
  const labels = [photo.displayLabel, lodgingAccommodationDisplayLabel(accName), accName].filter(Boolean);
  for (const line of text.split(/\r?\n/)) {
    if (!lineLooksLikePriceOption(line)) continue;
    for (const label of labels) {
      if (lineLooksLikeLodgingQuote(line, label)) {
        return normalizePriceLine(line, photo.displayLabel);
      }
    }
  }
  return "";
}

function extractIntroAndFooter(text: string): { intro: string; footer: string } {
  const lines = text.split(/\r?\n/);
  const footerIdx = lines.findIndex(
    (line) =>
      FOOTER_SECTION_RE.test(line.trim()) || /^Valores sujeitos/i.test(line.trim())
  );
  const opcoesIdx = lines.findIndex((line) => OPCOES_SECTION_RE.test(line.trim()));

  let endIntro = footerIdx >= 0 ? footerIdx : lines.length;
  if (opcoesIdx >= 0 && opcoesIdx < endIntro) {
    endIntro = opcoesIdx;
  } else {
    const firstPriceIdx = lines.findIndex((line, i) => i < endIntro && lineLooksLikePriceOption(line));
    if (firstPriceIdx >= 0) endIntro = firstPriceIdx;
  }

  const introLines: string[] = [];
  for (let i = 0; i < endIntro; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || lineIsImageOnly(trimmed)) continue;
    if (OPCOES_SECTION_RE.test(trimmed)) continue;
    if (lineLooksLikePriceOption(lines[i])) continue;
    introLines.push(lines[i]);
  }

  const footer =
    footerIdx >= 0
      ? lines
          .slice(footerIdx)
          .map((l) => l.trim())
          .filter(Boolean)
          .join("\n")
      : "";

  return {
    intro: introLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    footer,
  };
}

/** Reconstrói opções a partir da tool (foto + preço), ignorando fotos agrupadas pelo modelo.
 * Aceita `payload.galleryPhotos = []` (modo "só texto": orçamento sem foto, foto sob demanda). */
export function rebuildSunsetLodgingQuoteFromTool(
  assistantText: string,
  payload: LodgingToolPayload
): string | null {
  const sorted = [...payload.accommodations].sort(
    (a, b) => (a.total_price ?? 0) - (b.total_price ?? 0)
  );
  const photoAssignments = buildPhotoAssignments(payload.accommodations, payload.galleryPhotos);
  const hasPhotos = payload.galleryPhotos.length > 0;
  const optionBlocks: string[] = [];

  for (const acc of sorted) {
    const accName = String(acc.name ?? "").trim();
    if (!accName) continue;
    const photo = photoAssignments.get(accName);

    // Modo "só texto": foto ausente — incluir bloco somente com o preço.
    if (!photo) {
      if (acc.total_price == null) continue;
      const displayLabel = lodgingAccommodationDisplayLabel(accName);
      optionBlocks.push(formatLodgingOptionPriceLine(acc, displayLabel, payload.nights));
      continue;
    }

    let priceLine = findPriceLineForAccommodation(assistantText, photo, accName);
    if (!priceLine && acc.total_price != null) {
      priceLine = formatLodgingOptionPriceLine(acc, photo.displayLabel, payload.nights);
    }
    if (!priceLine) continue;

    if (hasPhotos) {
      optionBlocks.push(`${photo.photoMarkdown}\n${priceLine}`);
    } else {
      optionBlocks.push(priceLine);
    }
  }

  if (optionBlocks.length === 0) return null;

  const toolIntro = buildSunsetLodgingQuoteIntroFromTool(payload);
  const { intro, footer } = extractIntroAndFooter(assistantText);
  const parts: string[] = [];
  if (toolIntro) parts.push(toolIntro);
  else if (intro) parts.push(polishSunsetLodgingQuoteReadableText(intro));
  parts.push(...optionBlocks);
  if (footer) {
    const { body, question } = extractLodgingQuoteClosingQuestion(footer);
    parts.push(polishSunsetLodgingQuoteReadableText(body));
    if (question) parts.push(question);
  }

  if (parts.length === 0) return null;
  return parts.join(`\n${MSG_SPLIT}\n`);
}

function photoForPriceLine(
  priceLine: string,
  galleryPhotos: SunsetLodgingGalleryPhoto[],
  photosByUrl: Map<string, string>
): string | null {
  for (const p of galleryPhotos) {
    if (lineLooksLikeLodgingQuote(priceLine, p.displayLabel)) {
      return p.photoMarkdown;
    }
  }
  for (const p of galleryPhotos) {
    if (p.imageUrl && priceLine.includes(p.imageUrl)) {
      return p.photoMarkdown;
    }
  }
  for (const url of photosByUrl.keys()) {
    if (priceLine.includes(url)) return photosByUrl.get(url) ?? null;
  }
  return null;
}

/** Move fotos agrupadas no topo para imediatamente antes da linha de preço correspondente. */
export function reorganizeSunsetLodgingQuotePhotos(
  assistantText: string,
  galleryPhotos: SunsetLodgingGalleryPhoto[]
): string {
  const base = (assistantText ?? "").trim();
  if (!base || galleryPhotos.length === 0) return base;
  if (!assistantDeliversLodgingQuote(base)) return base;

  const lines = base.split(/\r?\n/);
  const photosByUrl = new Map<string, string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!lineIsImageOnly(trimmed)) continue;
    const m = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
    if (m?.[1]) photosByUrl.set(m[1], trimmed);
  }

  const footerIdx = lines.findIndex(
    (line) =>
      FOOTER_SECTION_RE.test(line.trim()) || /^Valores sujeitos/i.test(line.trim())
  );
  const bodyEnd = footerIdx >= 0 ? footerIdx : lines.length;

  const priceLineIndices: number[] = [];
  for (let i = 0; i < bodyEnd; i++) {
    if (lineLooksLikePriceOption(lines[i])) priceLineIndices.push(i);
  }
  if (priceLineIndices.length === 0) return base;

  const firstPriceIdx = priceLineIndices[0];
  const introLines: string[] = [];
  for (let i = 0; i < firstPriceIdx; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      introLines.push("");
      continue;
    }
    if (lineIsImageOnly(trimmed)) continue;
    introLines.push(lines[i]);
  }

  const optionBlocks: string[] = [];
  for (const idx of priceLineIndices) {
    const priceLine = normalizePriceLine(
      lines[idx].trim(),
      galleryPhotos.find((p) => lineLooksLikeLodgingQuote(lines[idx], p.displayLabel))?.displayLabel ??
        lines[idx].replace(/\*/g, "").split(/[—–-]/)[0]?.trim() ??
        "Acomodação"
    );
    let photoLine = "";
    const prev = (lines[idx - 1] ?? "").trim();
    if (lineIsImageOnly(prev)) {
      photoLine = prev;
    } else {
      const matched = photoForPriceLine(priceLine, galleryPhotos, photosByUrl);
      if (matched) photoLine = matched;
    }
    optionBlocks.push(photoLine ? `${photoLine}\n${priceLine}` : priceLine);
  }

  const footerLines =
    footerIdx >= 0 ? lines.slice(footerIdx).map((l) => l.trim()).filter(Boolean) : [];

  const out: string[] = [];
  const intro = introLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (intro) out.push(polishSunsetLodgingQuoteReadableText(intro));
  out.push(...optionBlocks);
  if (footerLines.length > 0) {
    const footerRaw = footerLines.join("\n");
    const { body, question } = extractLodgingQuoteClosingQuestion(footerRaw);
    out.push(polishSunsetLodgingQuoteReadableText(body));
    if (question) out.push(question);
  }

  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function insertSunsetLodgingMessageSplits(text: string): string {
  const lines = text.split(/\r?\n/);
  const footerIdx = lines.findIndex(
    (line) =>
      FOOTER_SECTION_RE.test(line.trim()) || /^Valores sujeitos/i.test(line.trim())
  );

  let firstPairIdx = -1;
  for (let i = 0; i < (footerIdx >= 0 ? footerIdx : lines.length) - 1; i++) {
    if (lineIsImageOnly(lines[i]) && lineLooksLikePriceOption(lines[i + 1])) {
      firstPairIdx = i;
      break;
    }
  }
  if (firstPairIdx < 0) {
    for (let i = 0; i < (footerIdx >= 0 ? footerIdx : lines.length); i++) {
      if (lineLooksLikePriceOption(lines[i])) {
        firstPairIdx = i;
        break;
      }
    }
  }
  if (firstPairIdx < 0) return text;

  const introLines = lines.slice(0, firstPairIdx).map((l) => l.trim()).filter(Boolean);
  const bodyEnd = footerIdx >= 0 ? footerIdx : lines.length;
  const bodyLines = lines.slice(firstPairIdx, bodyEnd);

  const optionBlocks: string[] = [];
  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i].trim();
    if (lineIsImageOnly(line) && i + 1 < bodyLines.length && lineLooksLikePriceOption(bodyLines[i + 1])) {
      optionBlocks.push(`${line}\n${bodyLines[i + 1].trim()}`);
      i += 2;
      continue;
    }
    if (lineLooksLikePriceOption(line)) {
      optionBlocks.push(line);
      i += 1;
      continue;
    }
    i += 1;
  }

  const footerLines =
    footerIdx >= 0 ? lines.slice(footerIdx).map((l) => l.trim()).filter(Boolean) : [];

  const parts: string[] = [];
  if (introLines.length > 0) {
    parts.push(polishSunsetLodgingQuoteReadableText(introLines.join("\n")));
  }
  for (const block of optionBlocks) {
    if (block.trim()) parts.push(block.trim());
  }
  if (footerLines.length > 0) {
    const footerRaw = footerLines.join("\n");
    const { body, question } = extractLodgingQuoteClosingQuestion(footerRaw);
    parts.push(polishSunsetLodgingQuoteReadableText(body));
    if (question) parts.push(question);
  }

  if (parts.length <= 1) return text;
  return parts.join(`\n${MSG_SPLIT}\n`);
}

/** Quando o LLM omitiu fotos inline mas a tool tem `gallery_photos` + `available_accommodations`
 * mesmo que `parseLodgingToolPayload` tenha falhado, conseguimos reconstruir via os campos
 * `rooms`/`loft_cotado_por`/preço/... que `runLodgingConsulta` retorna na tool principal.
 *
 * Aqui usamos o `toolResultStrings` direto: cada JSON é parseado e usamos
 * `(acomodação, preço)` quando casar uma foto da galeria.
 */
function parseLodgingToolPayloadLoose(
  toolResultStrings: string[],
  galleryPhotos: SunsetLodgingGalleryPhoto[]
): LodgingToolPayload | null {
  // Tentar via parser estrito primeiro (cobre o caso principal).
  const strict = parseLodgingToolPayload(toolResultStrings);
  if (strict) return strict;

  // Fallback: extrair accommodations do JSON cru (sem exigir gallery_photos junto).
  const accs: Array<{ name?: string; total_price?: number }> = [];
  let nights = 1;
  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as {
        nights?: number;
        available_accommodations?: Array<{ name?: string; total_price?: number }>;
      };
      if (typeof parsed.nights === "number" && parsed.nights > 0) {
        nights = parsed.nights;
      }
      if (Array.isArray(parsed.available_accommodations) && parsed.available_accommodations.length > 0) {
        for (const a of parsed.available_accommodations) {
          if (a?.name && typeof a.total_price === "number") accs.push(a);
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (accs.length === 0 || galleryPhotos.length === 0) return null;
  return { nights, accommodations: accs, galleryPhotos };
}

export function formatSunsetLodgingQuoteForDelivery(
  assistantText: string,
  toolResultStrings: string[],
  opts?: { lastUserMessage?: string }
): string {
  const base = (assistantText ?? "").trim();
  if (opts?.lastUserMessage && userMessageIsPhotoRequestOnly(opts.lastUserMessage)) {
    return assistantText ?? "";
  }
  const looseGalleryPhotos = collectSunsetLodgingGalleryPhotosFromToolResults(toolResultStrings);
  const toolPayload =
    parseLodgingToolPayload(toolResultStrings) ||
    parseLodgingToolPayloadLoose(toolResultStrings, looseGalleryPhotos);

  if (
    !shouldRebuildSunsetQuoteFromTool(base, toolPayload, opts) &&
    !assistantDeliversLodgingQuote(base)
  ) {
    return assistantText ?? "";
  }

  const shouldFormat =
    !!toolPayload ||
    assistantDeliversLodgingQuote(base) ||
    isSunsetLodgingQuoteContext(base, toolResultStrings);

  if (!shouldFormat) return assistantText ?? "";

  let branch: "B-rebuild" | "C-bypass" | "D-reorganize" = "D-reorganize";
  let text: string;
  if (toolPayload) {
    const rebuilt = rebuildSunsetLodgingQuoteFromTool(
      base || "Segue o orçamento solicitado.",
      toolPayload
    );
    if (rebuilt) {
      branch = "B-rebuild";
      text = rebuilt;
    } else {
      // Caminho extra: tentar novamente com `galleryPhotos` explícito quando o caller anterior
      // falhou por mismatch de label. Mantém o texto original como último recurso.
      branch = "D-reorganize";
      if (looseGalleryPhotos.length === 0) {
        text = base;
      } else {
        text = reorganizeSunsetLodgingQuotePhotos(base, looseGalleryPhotos);
        text = insertSunsetLodgingMessageSplits(text);
      }
    }
  } else if (!base) {
    branch = "C-bypass";
    text = assistantText ?? "";
  } else {
    if (looseGalleryPhotos.length === 0) {
      branch = "C-bypass";
      text = base;
    } else {
      branch = "D-reorganize";
      text = reorganizeSunsetLodgingQuotePhotos(base, looseGalleryPhotos);
      text = insertSunsetLodgingMessageSplits(text);
    }
  }

  if (text && !text.includes(MSG_SPLIT)) {
    text = ensureSunsetLodgingQuoteMessageSplits(text);
  }
  if (text && !text.includes(MSG_SPLIT)) {
    text = polishSunsetLodgingQuoteReadableText(text);
  }

  // [diag] transient — confirma em produção qual ramo foi tomado e se agrupou MSG_SPLIT.
  // Filtro: `grep '\[SunsetQuote\]\[diag\]' server.log`
  try {
    const counts = text?.includes(MSG_SPLIT)
      ? text.split(MSG_SPLIT).length
      : 0;
    const hasImage = !!text && /!\[.*\]\(https?:/.test(text);
    const accommodationsHaveName = (toolPayload?.accommodations ?? []).map((a) => a?.name);
    const photosHaveName = (toolPayload?.galleryPhotos ?? looseGalleryPhotos).map((p) => p?.accommodationName);
    const photoToggle = shouldIncludeSunsetLodgingPhotoInQuote() ? "on" : "off";
    console.warn(
      `[SunsetQuote][diag] branch=${branch} toolPayload=${toolPayload ? "yes" : "no"} ` +
        `accs=${toolPayload?.accommodations.length ?? 0} photos=${looseGalleryPhotos.length} ` +
        `splits=${counts} hasImage=${hasImage} photoToggle=${photoToggle} ` +
        `accNames=${JSON.stringify(accommodationsHaveName)} ` +
        `photoNames=${JSON.stringify(photosHaveName)}`
    );
  } catch {
    /* ignore logger errors */
  }

  return text ?? assistantText ?? "";
}
