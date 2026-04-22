import type { SuiteGallery, SuiteGalleryMedia } from "@/types/database";

/** URL para miniatura do cartão: capa explícita ou primeira foto em media_urls. */
export function getSuiteGalleryThumbnailUrl(gallery: SuiteGallery): string | null {
  const explicit = gallery.cover_image_url?.trim();
  if (explicit) return explicit;
  const media = normalizeSuiteGalleryMedia(gallery.media_urls as unknown);
  const photo = media.find((m) => m.type === "photo" && m.url?.trim());
  if (photo?.url) return photo.url.trim();
  const nonVideo = media.find((m) => m.url?.trim() && m.type !== "video");
  return nonVideo?.url?.trim() ?? null;
}

function normalizeSuiteGalleryMedia(raw: unknown): SuiteGalleryMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is SuiteGalleryMedia => !!m && typeof m === "object" && typeof (m as SuiteGalleryMedia).url === "string");
}
