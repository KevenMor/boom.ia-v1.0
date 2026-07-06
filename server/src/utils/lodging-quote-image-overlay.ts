import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { createNexusClient } from "../services/supabase.js";
import { normalizeStorageUrlForExternalUse } from "../lib/supabase-storage-public-url.js";

const QUOTE_OVERLAY_BUCKET = "suite-galleries";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Faixa inferior com nome da acomodação + valor (SVG rasterizado pelo sharp). */
export function buildLodgingQuoteOverlaySvg(
  width: number,
  height: number,
  label: string,
  price: string
): string {
  const bannerHeight = Math.min(148, Math.max(108, Math.round(height * 0.22)));
  const safeLabel = escapeXml(label.trim().slice(0, 48));
  const safePrice = escapeXml(price.trim().slice(0, 32));
  const labelY = height - bannerHeight + 38;
  const priceY = height - bannerHeight + 92;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="banner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="12%" stop-color="rgba(0,0,0,0.62)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${height - bannerHeight}" width="${width}" height="${bannerHeight}" fill="url(#banner)"/>
  <text x="32" y="${labelY}" fill="#f0f0f0" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" letter-spacing="0.5">${safeLabel}</text>
  <text x="32" y="${priceY}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${safePrice}</text>
</svg>`;
}

export function parseLodgingQuotePriceLine(line: string): { label: string; price: string } | null {
  const trimmed = line.trim();
  const priceMatch = trimmed.match(/\bR\$\s*[\d.,]+/);
  if (!priceMatch) return null;
  const price = priceMatch[0];
  const boldMatch = trimmed.match(/\*([^*]+)\*/);
  const label =
    boldMatch?.[1]?.trim() ||
    trimmed
      .split(/[—–-]/)[0]
      ?.replace(/\*/g, "")
      .trim() ||
    "Acomodação";
  return { label, price };
}

const IMAGE_MD_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;

export function isLodgingQuoteImageWithPriceBlock(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  if (!IMAGE_MD_RE.test(lines[0])) return false;
  return parseLodgingQuotePriceLine(lines[1]) != null;
}

export async function composeLodgingQuoteImageWithOverlay(
  imageUrl: string,
  label: string,
  price: string
): Promise<Buffer> {
  const fetchUrl = normalizeStorageUrlForExternalUse(imageUrl);
  const resp = await fetch(fetchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BoomIA/1.0)",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!resp.ok) {
    throw new Error(`image_fetch_failed_${resp.status}`);
  }

  const inputBuf = Buffer.from(await resp.arrayBuffer());
  const image = sharp(inputBuf, { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 800;

  const svg = buildLodgingQuoteOverlaySvg(width, height, label, price);
  const overlayBuf = Buffer.from(svg);

  return image
    .rotate()
    .composite([{ input: overlayBuf, top: 0, left: 0 }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

export async function uploadLodgingQuoteOverlayImage(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  buffer: Buffer
): Promise<string> {
  const path = `${tenantId}/quote-overlays/${randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(QUOTE_OVERLAY_BUCKET).upload(path, buffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw error;

  const nexusUrl = process.env.NEXUS_DB_URL?.replace(/\/+$/, "") ?? "";
  if (!nexusUrl) {
    throw new Error("NEXUS_DB_URL_missing");
  }
  return normalizeStorageUrlForExternalUse(
    `${nexusUrl}/storage/v1/object/public/${QUOTE_OVERLAY_BUCKET}/${path}`
  );
}
