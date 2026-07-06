/**
 * Formata orçamentos Sunset (hospedagem) para WhatsApp: uma bolha por acomodação
 * (foto da galeria + linha de preço), depois rodapé com incluso/horários/pagamento.
 */

import {
  collectSunsetLodgingGalleryPhotosFromToolResults,
  lodgingAccommodationDisplayLabel,
  type SunsetLodgingGalleryPhoto,
} from "./sunset-lodging-gallery-photos.js";
import {
  extractLodgingQuoteClosingQuestion,
  polishSunsetLodgingQuoteReadableText,
} from "./sunset-lodging-quote-layout.js";

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
  return (
    OPCOES_SECTION_RE.test(t) ||
    /Segue o orçamento|orçamento solicitado/i.test(t) ||
    (t.match(/R\$\s*[\d.,]+/g)?.length ?? 0) >= 2
  );
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
  accommodations: Array<{ name?: string; total_price?: number }>;
  galleryPhotos: SunsetLodgingGalleryPhoto[];
};

function parseLodgingToolPayload(toolResultStrings: string[]): LodgingToolPayload | null {
  let accommodations: Array<{ name?: string; total_price?: number }> = [];
  const galleryPhotos: SunsetLodgingGalleryPhoto[] = [];
  const seenPhotoUrls = new Set<string>();

  const pushPhoto = (p: SunsetLodgingGalleryPhoto | undefined) => {
    if (!p?.imageUrl || !p?.photoMarkdown) return;
    if (seenPhotoUrls.has(p.imageUrl)) return;
    seenPhotoUrls.add(p.imageUrl);
    galleryPhotos.push(p);
  };

  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as {
        available_accommodations?: Array<{ name?: string; total_price?: number }>;
        gallery_photos?: SunsetLodgingGalleryPhoto[];
      };
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

  if (accommodations.length === 0 || galleryPhotos.length === 0) return null;
  return { accommodations, galleryPhotos };
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

  if (assignments.size === 0 && sorted.length === galleryPhotos.length) {
    sorted.forEach((acc, idx) => {
      const accName = String(acc.name ?? "").trim();
      const photo = galleryPhotos[idx];
      if (accName && photo) assignments.set(accName, photo);
    });
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

/** Reconstrói opções a partir da tool (foto + preço), ignorando fotos agrupadas pelo modelo. */
export function rebuildSunsetLodgingQuoteFromTool(
  assistantText: string,
  payload: LodgingToolPayload
): string | null {
  const sorted = [...payload.accommodations].sort(
    (a, b) => (a.total_price ?? 0) - (b.total_price ?? 0)
  );
  const photoAssignments = buildPhotoAssignments(payload.accommodations, payload.galleryPhotos);
  const optionBlocks: string[] = [];

  for (const acc of sorted) {
    const accName = String(acc.name ?? "").trim();
    if (!accName) continue;
    const photo = photoAssignments.get(accName);
    if (!photo) continue;

    let priceLine = findPriceLineForAccommodation(assistantText, photo, accName);
    if (!priceLine && acc.total_price != null) {
      priceLine = `*${photo.displayLabel}* — ${formatCurrencyBR(acc.total_price)}`;
    }
    if (!priceLine) continue;

    optionBlocks.push(`${photo.photoMarkdown}\n${priceLine}`);
  }

  if (optionBlocks.length === 0) return null;

  const { intro, footer } = extractIntroAndFooter(assistantText);
  const parts: string[] = [];
  if (intro) parts.push(polishSunsetLodgingQuoteReadableText(intro));
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

export function formatSunsetLodgingQuoteForDelivery(
  assistantText: string,
  toolResultStrings: string[]
): string {
  const base = (assistantText ?? "").trim();
  const toolPayload = parseLodgingToolPayload(toolResultStrings);
  const shouldFormat =
    !!toolPayload ||
    assistantDeliversLodgingQuote(base) ||
    isSunsetLodgingQuoteContext(base, toolResultStrings);

  if (!shouldFormat) return assistantText ?? "";

  let text: string;
  if (toolPayload) {
    const rebuilt = rebuildSunsetLodgingQuoteFromTool(
      base || "Segue o orçamento solicitado.",
      toolPayload
    );
    text = rebuilt ?? base;
  } else if (!base) {
    return assistantText ?? "";
  } else {
    const galleryPhotos = collectSunsetLodgingGalleryPhotosFromToolResults(toolResultStrings);
    if (galleryPhotos.length === 0) return base;
    text = reorganizeSunsetLodgingQuotePhotos(base, galleryPhotos);
    text = insertSunsetLodgingMessageSplits(text);
  }

  if (!text.includes(MSG_SPLIT)) {
    text = polishSunsetLodgingQuoteReadableText(text);
  }
  return text;
}
