/**
 * Valida URLs de fotos de veículos vindas do sync do site.
 * Rejeita diretórios (/galeria/), páginas HTML e links sem arquivo de imagem.
 */

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|bmp)(\?|#|$)/i;

export function isLikelyDirectVehicleImageUrl(url: string): boolean {
  const raw = (url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return false;

  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.toLowerCase();

    if (!path || path === "/") return false;
    if (/\/galeria\/?$/i.test(path)) return false;
    if (path.endsWith("/") && !IMAGE_EXT_RE.test(path)) return false;
    if (/\/galeria\b/i.test(path) && !IMAGE_EXT_RE.test(path)) return false;

    if (IMAGE_EXT_RE.test(path)) return true;
    if (path.includes("/storage/v1/object/")) return true;

    return false;
  } catch {
    return false;
  }
}

export function filterValidInventoryPhotoUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const trimmed = (url || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!isLikelyDirectVehicleImageUrl(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function buildInventoryPhotosMarkdown(urls: string[]): string {
  return filterValidInventoryPhotoUrls(urls)
    .map((url) => `![foto](${url})`)
    .join("\n");
}

/** Resposta ao cliente quando não há fotos válidas ou a entrega falhou. */
export const INVENTORY_PHOTOS_UNAVAILABLE_PT =
  "No momento não consegui enviar as fotos por aqui. Já encaminhei seu pedido para um consultor dar continuidade e te mandar as imagens em seguida.";

export function isDeliverableImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.split(";")[0]?.trim().toLowerCase() || "";
  if (ct.startsWith("image/")) return true;
  return false;
}
