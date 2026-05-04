/**
 * Converte link de compartilhamento do Google Drive em URL de download direto.
 * Formato share: https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
 * Formato download: https://drive.google.com/uc?export=download&id={FILE_ID}
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
