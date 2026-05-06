/** Extensões de imagem comuns; MIME em `File.type` costuma vir vazio (ex.: JPEG no Windows). */
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)(\?.*)?$/i;

export function isImageFileByMimeOrExtension(file: File): boolean {
  const t = (file.type ?? "").trim();
  if (t.startsWith("image/")) return true;
  return IMAGE_EXT_RE.test(file.name ?? "");
}

/** Para Storage: garantir `image/jpeg` etc. quando o browser não preenche `file.type`. */
export function inferImageContentTypeForUpload(file: File): string {
  const t = (file.type ?? "").trim();
  if (t.startsWith("image/")) return t;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
  };
  return map[ext] ?? "image/jpeg";
}
