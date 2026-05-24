import { hasAtLeastOneCompleteMarkdownHttpImage } from "./suite-gallery-markdown-inject.js";
import {
  buildInventoryPhotosMarkdown,
  filterValidInventoryPhotoUrls,
  INVENTORY_PHOTOS_UNAVAILABLE_PT,
  isLikelyDirectVehicleImageUrl,
} from "../lib/inventory-photo-url.js";

interface VehiclePhotoBlock {
  id: string;
  name: string;
  photosMarkdown: string;
}

function parseInventoryToolResults(toolResultStrings: string[]): VehiclePhotoBlock[] {
  const blocks: VehiclePhotoBlock[] = [];
  const seenIds = new Set<string>();

  for (const raw of toolResultStrings) {
    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!obj || !Array.isArray(obj.vehicles)) continue;

    for (const v of obj.vehicles) {
      const id = typeof v.id === "string" ? v.id.trim() : "";
      const name = typeof v.nome_completo === "string" ? v.nome_completo.trim() : "";
      const pm = typeof v.photos_markdown === "string" ? buildInventoryPhotosMarkdown(
        v.photos_markdown.split(/\r?\n/).map((line) => {
          const m = line.match(/\((https?:\/\/[^)\s]+)\)/);
          return m?.[1] || "";
        }).filter(Boolean)
      ) : "";
      if (!pm) continue;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      blocks.push({ id, name, photosMarkdown: pm });
    }

    if (blocks.length === 0 && typeof obj.photos_markdown === "string" && obj.photos_markdown.trim()) {
      const pm = buildInventoryPhotosMarkdown(
        obj.photos_markdown.split(/\r?\n/).map((line: string) => {
          const m = line.match(/\((https?:\/\/[^)\s]+)\)/);
          return m?.[1] || "";
        }).filter(Boolean)
      );
      if (pm) blocks.push({ id: "", name: "", photosMarkdown: pm });
    }
  }
  return blocks;
}

const ENVIAR_FOTOS_REGEX = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)(?:\s*\|\s*id:\s*([a-f0-9-]{36}))?(?:\s*\|\s*(\d+))?\s*$/im;
const MARKDOWN_IMAGE_LINE_RE = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)\s*$/;

/**
 * Garante ordem de entrega no WhatsApp/Chatwoot: bloco de fotos primeiro, texto depois.
 * O delivery.ts aplica delay entre imagens e o texto seguinte para preservar a ordem.
 */
export function reorderInventoryPhotosBeforeText(assistantText: string): string {
  if (!assistantText?.trim()) return assistantText;
  if (!hasAtLeastOneCompleteMarkdownHttpImage(assistantText)) return assistantText;

  const lines = assistantText.split(/\r?\n/);
  const imageLines = lines.filter((l) => MARKDOWN_IMAGE_LINE_RE.test(l.trim()));
  if (imageLines.length === 0) return assistantText;

  const firstImageIdx = lines.findIndex((l) => MARKDOWN_IMAGE_LINE_RE.test(l.trim()));
  const firstTextIdx = lines.findIndex((l) => l.trim() && !MARKDOWN_IMAGE_LINE_RE.test(l.trim()));
  if (firstImageIdx >= 0 && (firstTextIdx < 0 || firstImageIdx < firstTextIdx)) {
    return assistantText;
  }

  const text = lines
    .filter((l) => !MARKDOWN_IMAGE_LINE_RE.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return imageLines.join("\n");
  return `${imageLines.join("\n")}\n\n${text}`;
}

export function injectInventoryPhotosIfMissing(params: {
  assistantText: string;
  toolResultStrings: string[];
}): { fullText: string } | null {
  const { assistantText, toolResultStrings } = params;
  if (!assistantText) return null;

  const cmdMatch = ENVIAR_FOTOS_REGEX.exec(assistantText);
  if (!cmdMatch) return null;

  if (hasAtLeastOneCompleteMarkdownHttpImage(assistantText)) return null;

  const blocks = parseInventoryToolResults(toolResultStrings);
  if (blocks.length === 0) {
    return { fullText: INVENTORY_PHOTOS_UNAVAILABLE_PT };
  }

  const requestedId = (cmdMatch[2] || "").trim();
  const maxPhotos = cmdMatch[3] ? parseInt(cmdMatch[3], 10) : 0;

  let chosen: VehiclePhotoBlock | undefined;
  if (requestedId) {
    chosen = blocks.find((b) => b.id === requestedId);
  }
  if (!chosen) {
    const requestedName = (cmdMatch[1] || "").trim().toLowerCase();
    chosen = blocks.find((b) => b.name.toLowerCase().includes(requestedName) || requestedName.includes(b.name.toLowerCase()));
  }
  if (!chosen && blocks.length === 1) {
    chosen = blocks[0];
  }
  if (!chosen) return null;

  let markdown = chosen.photosMarkdown;
  if (maxPhotos > 0) {
    const lines = markdown.split(/\r?\n/).filter((l) => l.trim().startsWith("!["));
    markdown = lines.slice(0, maxPhotos).join("\n");
  }

  const textWithoutCmd = assistantText.replace(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/gim, "").trim();

  if (!markdown.trim()) {
    return { fullText: INVENTORY_PHOTOS_UNAVAILABLE_PT };
  }

  const sep = textWithoutCmd ? "\n\n" : "";
  return { fullText: reorderInventoryPhotosBeforeText(`${markdown}${sep}${textWithoutCmd}`) };
}

/**
 * Remove markdown de fotos inválidas (ex.: /galeria/) e substitui tentativa de envio por mensagem ao consultor.
 */
export function sanitizeInvalidInventoryPhotoAttempt(assistantText: string): string {
  if (!assistantText?.trim()) return assistantText;

  const lines = assistantText.split(/\r?\n/);
  const imageLines = lines.filter((l) => MARKDOWN_IMAGE_LINE_RE.test(l.trim()));
  const validImageLines = imageLines.filter((l) => {
    const m = MARKDOWN_IMAGE_LINE_RE.exec(l.trim());
    return Boolean(m?.[1] && isLikelyDirectVehicleImageUrl(m[1]));
  });

  const hadInvalidOnly = imageLines.length > 0 && validImageLines.length === 0;
  const hasEnviarCmd = ENVIAR_FOTOS_REGEX.test(assistantText);

  if (!hadInvalidOnly && !(hasEnviarCmd && validImageLines.length === 0 && imageLines.length === 0)) {
    if (imageLines.length === validImageLines.length) return assistantText;
    const cleaned = lines.filter((l) => {
      const trimmed = l.trim();
      if (!MARKDOWN_IMAGE_LINE_RE.test(trimmed)) return true;
      const m = MARKDOWN_IMAGE_LINE_RE.exec(trimmed);
      return Boolean(m?.[1] && isLikelyDirectVehicleImageUrl(m[1]));
    });
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const textOnly = lines
    .filter((l) => {
      const trimmed = l.trim();
      if (!trimmed) return false;
      if (MARKDOWN_IMAGE_LINE_RE.test(trimmed)) return false;
      if (/^ENVIAR_FOTOS?_VEICULOS?[:\s]/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (/dá uma olhada|olha só|veja que|tá aqui pra você|confira as fotos/i.test(textOnly)) {
    return INVENTORY_PHOTOS_UNAVAILABLE_PT;
  }

  return textOnly ? `${INVENTORY_PHOTOS_UNAVAILABLE_PT}\n\n${textOnly}` : INVENTORY_PHOTOS_UNAVAILABLE_PT;
}
