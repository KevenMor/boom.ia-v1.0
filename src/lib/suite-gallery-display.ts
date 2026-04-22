import type { SuiteGallery, SuiteGalleryMedia } from "@/types/database";

const SUPABASE_PROXY_MARKER = "/api/supabase-proxy/";
const STORAGE_V1_MARKER = "/storage/v1/";

/**
 * Buckets públicos do Supabase respondem em …/storage/v1/object/public/{bucket}/…
 * URLs sem o segmento `public` (ex.: …/object/suite-galleries/…) falham no gateway.
 * Não altera rotas da API (sign, upload, move, etc.).
 */
export function ensureSupabaseStoragePublicObjectPath(url: string): string {
  if (!url.includes("/storage/v1/object/")) return url;
  return url.replace(
    /\/storage\/v1\/object\/(?!public\/|sign\/|authenticated\/|upload\/|info\/|list-v2\/|list\/|move|copy)/g,
    "/storage/v1/object/public/"
  );
}

/**
 * Reescreve URLs de Storage para o proxy no domínio atual.
 * Em produção o banco pode misturar: proxy antigo, host direto do Supabase, localhost de dev —
 * tudo com `/storage/v1/` passa pelo mesmo-origin proxy (exceto signed/authenticated).
 */
export function normalizeSuiteGalleryMediaUrlForOrigin(url: string, pageOrigin: string): string {
  const t = ensureSupabaseStoragePublicObjectPath(url.trim());
  if (!t) return t;
  const lower = t.toLowerCase();
  if (lower.includes("/storage/v1/object/sign/") || lower.includes("/storage/v1/object/authenticated/")) {
    return t;
  }
  try {
    const u = new URL(t);
    const idx = u.pathname.indexOf(STORAGE_V1_MARKER);
    if (idx !== -1) {
      const pathFromStorage = u.pathname.slice(idx) + u.search + u.hash;
      const origin = pageOrigin.replace(/\/$/, "");
      return `${origin}/api/supabase-proxy${pathFromStorage}`;
    }
  } catch {
    /* URL relativa ou inválida */
  }
  const ix = lower.indexOf(SUPABASE_PROXY_MARKER);
  if (ix === -1) return t;
  const origin = pageOrigin.replace(/\/$/, "");
  return `${origin}${t.slice(ix)}`;
}

/**
 * URLs de Storage via proxy são gravadas com a origem do momento (ex.: http://localhost:8080 em dev).
 * Em produção isso vira 404 / mixed content. Reaplica sempre a origem atual do browser para o mesmo path.
 */
export function normalizeSuiteGalleryMediaUrl(url: string): string {
  if (typeof window === "undefined") {
    return ensureSupabaseStoragePublicObjectPath(url.trim());
  }
  return normalizeSuiteGalleryMediaUrlForOrigin(url, window.location.origin);
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
