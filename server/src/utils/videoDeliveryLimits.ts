/** Limites alinhados ao envio Chatwoot/WhatsApp em `delivery.ts`. */

export const VIDEO_SIZE_LIMIT_MB = 16;
export const VIDEO_SIZE_LIMIT_BYTES = VIDEO_SIZE_LIMIT_MB * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type VideoDeliveryClass = "native_video" | "document" | "link_only";

export function classifyVideoDelivery(sizeBytes: number): VideoDeliveryClass {
  if (sizeBytes > MAX_VIDEO_BYTES) return "link_only";
  if (sizeBytes <= VIDEO_SIZE_LIMIT_BYTES) return "native_video";
  return "document";
}

export function formatMegabytesApprox(sizeBytes: number): string {
  const mb = sizeBytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  return `${mb.toFixed(2)} MB`;
}

/** Rótulo para a UI do inventário (probe), em português. */
export function humanDeliveryLabelPt(sizeBytes: number, mode: VideoDeliveryClass): string {
  const size = formatMegabytesApprox(sizeBytes);
  switch (mode) {
    case "native_video":
      return `≈ ${size} · envio como vídeo nativo no WhatsApp`;
    case "document":
      return `≈ ${size} · envio como arquivo (anexo); segue mensagem explicando`;
    case "link_only":
      return `≈ ${size} · acima do limite de anexo: cliente recebe o link em texto`;
  }
}
