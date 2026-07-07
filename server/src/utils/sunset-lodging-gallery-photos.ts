import type { createNexusClient } from "../services/supabase.js";
import { normalizeStorageUrlForExternalUse } from "../lib/supabase-storage-public-url.js";
import { galleryRotuloParaCliente, isGalleryExcludedFromClientCatalog } from "./suite-gallery-llm-labels.js";

/**
 * Toggle master: quando `false`, fotos das suítes NUNCA são enviadas no orçamento.
 * O pipeline "sob demanda" (`suite_gallery_query` via `userLikelyAskedForPhotos` em
 * `suite-gallery-markdown-inject.ts`) continua ativo e cobre os casos
 * "cliente pediu foto" e "cliente escolheu acomodação".
 *
 * Default Sunset = `false` desde 2026-07-07 (chamado pelo usuário).
 * Para reativar: mudar para `true` + redeploy do server.
 */
export const SUNSET_LODGING_SEND_PHOTOS_WITH_QUOTE = false;

export function shouldIncludeSunsetLodgingPhotoInQuote(): boolean {
  return SUNSET_LODGING_SEND_PHOTOS_WITH_QUOTE;
}

export type SunsetLodgingGalleryPhoto = {
  accommodationName: string;
  displayLabel: string;
  galleryName: string;
  imageUrl: string;
  photoMarkdown: string;
};

type GalleryRow = {
  name: string;
  description: string | null;
  cover_image_url: string | null;
  media_urls: unknown;
};

type MediaItem = { url?: string; type?: string };

function normalizeKey(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome amigável ao cliente (espelha §3b-formato do prompt Sunset). */
export function lodgingAccommodationDisplayLabel(internalName: string): string {
  const n = normalizeKey(internalName);
  if (n.includes("standart")) return "Chalé";
  if (n.includes("master")) return "Suíte Master";
  if (n.includes("luxo") && n.includes("varanda")) return "Suíte com Varanda";
  if (n.includes("luxo") && n.includes("sem varanda")) return "Suíte Luxo";
  if (n.includes("luxo duplo")) return "Suíte Luxo";
  if (n.includes("apartamento") || n.includes("vista piscina")) return "Apartamento Vista Piscina";
  if (n.includes("loft") || n.includes("spa")) return "Loft com SPA";
  return internalName.trim();
}

/** Termos para casar com `suite_galleries.name` do painel. */
export function lodgingAccommodationGallerySearchKeys(internalName: string): string[] {
  const n = normalizeKey(internalName);
  if (n.includes("standart")) return ["chale", "chalé"];
  if (n.includes("master")) return ["suite luxo master", "master com varanda", "luxo master"];
  if (n.includes("luxo") && n.includes("varanda")) return ["suite luxo com varanda", "luxo com varanda"];
  if (n.includes("luxo") && n.includes("sem varanda")) return ["suite luxo sem varanda", "luxo sem varanda"];
  if (n.includes("luxo duplo")) return ["suite luxo sem varanda", "suite luxo", "luxo duplo"];
  if (n.includes("apartamento") || n.includes("vista piscina")) {
    return ["apartamento com vista", "apartamento vista", "vista piscina"];
  }
  if (n.includes("loft") || n.includes("spa")) return ["loft premium", "loft com spa", "loft"];
  return [internalName];
}

function firstPhotoUrlFromGallery(row: GalleryRow): string | null {
  const coverRaw = typeof row.cover_image_url === "string" ? row.cover_image_url.trim() : "";
  if (coverRaw && /^https?:\/\//i.test(coverRaw)) {
    return normalizeStorageUrlForExternalUse(coverRaw);
  }
  const media = Array.isArray(row.media_urls) ? (row.media_urls as MediaItem[]) : [];
  for (const m of media) {
    if (m?.type !== "photo") continue;
    const url = typeof m.url === "string" ? m.url.trim() : "";
    if (url && /^https?:\/\//i.test(url)) {
      return normalizeStorageUrlForExternalUse(url);
    }
  }
  return null;
}

export function matchGalleryRowToAccommodation(
  row: GalleryRow,
  searchKeys: string[]
): boolean {
  if (isGalleryExcludedFromClientCatalog(row.name)) return false;
  const galleryNorm = normalizeKey(row.name);
  const descNorm = normalizeKey(row.description ?? "");
  for (const key of searchKeys) {
    const k = normalizeKey(key);
    if (!k) continue;
    if (galleryNorm.includes(k) || k.includes(galleryNorm)) return true;
    if (descNorm && (descNorm.includes(k) || k.includes(descNorm))) return true;
  }
  return false;
}

function buildPhotoMarkdown(label: string, imageUrl: string): string {
  const safeLabel = label.replace(/\s+/g, " ").trim().slice(0, 80);
  const url = imageUrl.replace(/\)/g, "%29");
  return `![${safeLabel}](${url})`;
}

export async function fetchSunsetLodgingGalleryPhotos(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  accommodationNames: string[]
): Promise<SunsetLodgingGalleryPhoto[]> {
  const uniqueNames = [...new Set(accommodationNames.map((n) => n.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return [];

  const { data: galleries, error } = await supabase
    .from("suite_galleries")
    .select("name, description, cover_image_url, media_urls")
    .eq("tenant_id", tenantId);

  if (error || !galleries?.length) return [];

  const rows = galleries as GalleryRow[];
  const usedGalleryNames = new Set<string>();
  const out: SunsetLodgingGalleryPhoto[] = [];

  for (const accName of uniqueNames) {
    const keys = lodgingAccommodationGallerySearchKeys(accName);
    const row = rows.find(
      (g) => !usedGalleryNames.has(g.name) && matchGalleryRowToAccommodation(g, keys)
    );
    if (!row) continue;

    const imageUrl = firstPhotoUrlFromGallery(row);
    if (!imageUrl) continue;

    const displayLabel =
      galleryRotuloParaCliente(row.name, row.description) ??
      lodgingAccommodationDisplayLabel(accName);

    usedGalleryNames.add(row.name);
    out.push({
      accommodationName: accName,
      displayLabel,
      galleryName: row.name,
      imageUrl,
      photoMarkdown: buildPhotoMarkdown(displayLabel, imageUrl),
    });
  }

  return out;
}

const LODGING_QUOTE_RE = /\bR\$\s*[\d.,]+/;

function photoMarkdownPresent(text: string, imageUrl: string, displayLabel: string): boolean {
  if (imageUrl && text.includes(imageUrl)) return true;
  const key = normalizeKey(displayLabel);
  const re = new RegExp(
    `!\\[[^\\]]*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\]]*\\]\\(https?:\\/\\/`,
    "i"
  );
  return re.test(text);
}

function lineLooksLikeLodgingQuote(line: string, displayLabel: string): boolean {
  const normLine = normalizeKey(line);
  const normLabel = normalizeKey(displayLabel);
  if (!normLine.includes(normLabel)) return false;
  return LODGING_QUOTE_RE.test(line);
}

function assistantDeliversLodgingQuote(text: string): boolean {
  const t = text || "";
  if (!LODGING_QUOTE_RE.test(t)) return false;
  return /\*Opções\*|Segue o orçamento|orçamento solicitado/i.test(t) || (t.match(/R\$\s*[\d.,]+/g)?.length ?? 0) >= 2;
}

/** Prefixa cada linha de preço com a foto da galeria correspondente. */
export function injectSunsetLodgingQuotePhotosIfMissing(
  assistantText: string,
  galleryPhotos: SunsetLodgingGalleryPhoto[]
): { appended: string; fullText: string } | null {
  const base = (assistantText ?? "").trimEnd();
  if (!base || galleryPhotos.length === 0) return null;
  if (!assistantDeliversLodgingQuote(base)) return null;

  const missing = galleryPhotos.filter(
    (p) =>
      lineLooksLikeLodgingQuote(base, p.displayLabel) &&
      !photoMarkdownPresent(base, p.imageUrl, p.displayLabel)
  );
  if (missing.length === 0) return null;

  const lines = base.split(/\r?\n/);
  const used = new Set<string>();
  const inserted: string[] = [];

  for (const photo of missing) {
    const key = normalizeKey(photo.displayLabel);
    if (used.has(key)) continue;

    const idx = lines.findIndex((line) => lineLooksLikeLodgingQuote(line, photo.displayLabel));
    if (idx < 0) continue;

    const prev = (lines[idx - 1] ?? "").trim();
    if (prev.startsWith("![") && prev.includes(photo.imageUrl)) {
      used.add(key);
      continue;
    }

    lines.splice(idx, 0, photo.photoMarkdown);
    inserted.push(photo.photoMarkdown);
    used.add(key);
  }

  const fullText = lines.join("\n");
  if (inserted.length === 0) {
    const tail = missing
      .filter((p) => !used.has(normalizeKey(p.displayLabel)))
      .map((p) => p.photoMarkdown);
    if (tail.length === 0) return null;
    return { appended: `\n\n${tail.join("\n")}`, fullText: `${base}\n\n${tail.join("\n")}` };
  }

  return {
    appended: inserted.map((line) => `\n${line}`).join(""),
    fullText,
  };
}

export function collectSunsetLodgingGalleryPhotosFromToolResults(
  toolResultStrings: string[]
): SunsetLodgingGalleryPhoto[] {
  const out: SunsetLodgingGalleryPhoto[] = [];
  const seen = new Set<string>();

  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as {
        gallery_photos?: SunsetLodgingGalleryPhoto[];
        available_accommodations?: Array<{ name?: string }>;
      };
      const photos = Array.isArray(parsed.gallery_photos) ? parsed.gallery_photos : [];
      for (const p of photos) {
        if (!p?.imageUrl || !p?.photoMarkdown) continue;
        const key = normalizeKey(p.accommodationName || p.displayLabel);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}
