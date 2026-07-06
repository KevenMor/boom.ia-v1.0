import type { createNexusClient } from "../services/supabase.js";
import {
  composeLodgingQuoteImageWithOverlay,
  isLodgingQuoteImageWithPriceBlock,
  parseLodgingQuotePriceLine,
  uploadLodgingQuoteOverlayImage,
} from "./lodging-quote-image-overlay.js";

const MSG_SPLIT = "<<MSG_SPLIT>>";
const IMAGE_MD_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;

async function overlaySingleLodgingQuoteBlock(
  block: string,
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string
): Promise<string> {
  if (!isLodgingQuoteImageWithPriceBlock(block)) return block;

  const lines = block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const imgMatch = lines[0].match(IMAGE_MD_RE);
  if (!imgMatch) return block;

  const imageUrl = imgMatch[2];
  const parsed = parseLodgingQuotePriceLine(lines[1]);
  if (!parsed) return block;

  const composed = await composeLodgingQuoteImageWithOverlay(imageUrl, parsed.label, parsed.price);
  const publicUrl = await uploadLodgingQuoteOverlayImage(supabase, tenantId, composed);
  return `![${parsed.label}](${publicUrl})`;
}

/**
 * Substitui blocos foto+preço por imagem composta (valor na foto) — orçamento Sunset.
 * Falha silenciosa por bloco: mantém legenda original se overlay/upload falhar.
 */
export async function applySunsetLodgingQuoteImageOverlays(
  text: string,
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string
): Promise<string> {
  const base = (text ?? "").trim();
  if (!base || !/\bR\$\s*[\d.,]+/.test(base)) return text;

  const parts = base.includes(MSG_SPLIT) ? base.split(MSG_SPLIT) : [base];
  const out: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    try {
      if (isLodgingQuoteImageWithPriceBlock(trimmed)) {
        out.push(await overlaySingleLodgingQuoteBlock(trimmed, supabase, tenantId));
        continue;
      }
    } catch (e) {
      console.warn("[SunsetLodgingOverlay] bloco falhou, mantendo legenda:", (e as Error)?.message);
    }
    out.push(trimmed);
  }

  if (out.length <= 1) return out[0] ?? text;
  return out.join(`\n${MSG_SPLIT}\n`);
}
