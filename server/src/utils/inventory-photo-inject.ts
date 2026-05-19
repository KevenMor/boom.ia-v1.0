import { hasAtLeastOneCompleteMarkdownHttpImage } from "./suite-gallery-markdown-inject.js";

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
      const pm = typeof v.photos_markdown === "string" ? v.photos_markdown.trim() : "";
      if (!pm) continue;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      blocks.push({ id, name, photosMarkdown: pm });
    }

    if (blocks.length === 0 && typeof obj.photos_markdown === "string" && obj.photos_markdown.trim()) {
      blocks.push({ id: "", name: "", photosMarkdown: obj.photos_markdown.trim() });
    }
  }
  return blocks;
}

const ENVIAR_FOTOS_REGEX = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)(?:\s*\|\s*id:\s*([a-f0-9-]{36}))?(?:\s*\|\s*(\d+))?\s*$/im;

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
  if (blocks.length === 0) return null;

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

  if (!markdown.trim()) return null;

  const textWithoutCmd = assistantText.replace(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/gim, "").trim();
  const sep = textWithoutCmd ? "\n\n" : "";
  return { fullText: `${textWithoutCmd}${sep}${markdown}` };
}
