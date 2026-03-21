/**
 * Converte link de compartilhamento do Google Drive em URL de download direto.
 * Útil para preview de vídeo no frontend.
 */
export function toDirectDownloadUrl(url: string): string {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  const match = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return trimmed;
}
