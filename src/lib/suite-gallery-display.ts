import type { SuiteGallery, SuiteGalleryMedia } from "@/types/database";

const SUPABASE_PROXY_MARKER = "/api/supabase-proxy/";

/**
 * URLs de Storage via proxy são gravadas com a origem do momento (ex.: http://localhost:8080 em dev).
 * Em produção isso vira 404 / mixed content. Reaplica sempre a origem atual do browser para o mesmo path.
 */
export function normalizeSuiteGalleryMediaUrl(url: string): string {
  const t = url.trim();
  if (!t || typeof window === "undefined") return t;
  const ix = t.toLowerCase().indexOf(SUPABASE_PROXY_MARKER);
  if (ix === -1) return t;
  const pathAndQuery = t.slice(ix);
  return `${window.location.origin}${pathAndQuery}`;
}

/** URL para miniatura do cartão: capa explícita ou primeira foto em media_urls. */
export function getSuiteGalleryThumbnailUrl(gallery: SuiteGallery): string | null {
  const explicit = gallery.cover_image_url?.trim();
  if (explicit) return normalizeSuiteGalleryMediaUrl(explicit);
  const media = normalizeSuiteGalleryMedia(gallery.media_urls as unknown);
  const photo = media.find((m) => m.type === "photo" && m.url?.trim());
  if (photo?.url) return normalizeSuiteGalleryMediaUrl(photo.url.trim());
  const nonVideo = media.find((m) => m.url?.trim() && m.type !== "video");
  const u = nonVideo?.url?.trim();
  return u ? normalizeSuiteGalleryMediaUrl(u) : null;
}

function normalizeSuiteGalleryMedia(raw: unknown): SuiteGalleryMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is SuiteGalleryMedia => !!m && typeof m === "object" && typeof (m as SuiteGalleryMedia).url === "string");
}
