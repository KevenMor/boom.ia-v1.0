/** Alinha com src/lib/suite-gallery-display.ts — buckets públicos exigem …/object/public/{bucket}/… */
export function ensureSupabaseStoragePublicObjectPath(url: string): string {
  if (!url.includes("/storage/v1/object/")) return url;
  return url.replace(
    /\/storage\/v1\/object\/(?!public\/|sign\/|authenticated\/|upload\/|info\/|list-v2\/|list\/|move|copy)/g,
    "/storage/v1/object/public/"
  );
}

/**
 * Normaliza URL de Storage para uso externo (WhatsApp, e-mail, etc.).
 * URLs salvas no banco podem ter a origem do momento do upload (ex.: http://localhost:8080).
 * Esta função extrai o path /storage/v1/… e reconstrói com NEXUS_DB_URL (Supabase direto),
 * que é sempre acessível publicamente — sem depender do proxy do frontend.
 */
export function normalizeStorageUrlForExternalUse(url: string): string {
  const fixed = ensureSupabaseStoragePublicObjectPath(url.trim());
  if (!fixed) return fixed;

  const nexusDbUrl = process.env.NEXUS_DB_URL?.replace(/\/+$/, "");
  if (!nexusDbUrl) return fixed;

  const STORAGE_V1_MARKER = "/storage/v1/";
  try {
    const u = new URL(fixed);
    const idx = u.pathname.indexOf(STORAGE_V1_MARKER);
    if (idx !== -1) {
      const pathFromStorage = u.pathname.slice(idx) + u.search + u.hash;
      return `${nexusDbUrl}${pathFromStorage}`;
    }
  } catch {
    // URL relativa ou inválida — retorna como está
  }
  return fixed;
}

function fixMediaUrlsField(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = item as Record<string, unknown>;
    if (typeof row.url !== "string") return item;
    return { ...row, url: ensureSupabaseStoragePublicObjectPath(row.url) };
  });
}

/** Corrige URLs de Storage público em um registro de suite_galleries (resposta API). */
export function fixSuiteGalleryStorageUrls<T extends Record<string, unknown>>(row: T): T {
  const cover =
    typeof row.cover_image_url === "string"
      ? ensureSupabaseStoragePublicObjectPath(row.cover_image_url)
      : row.cover_image_url;
  return {
    ...row,
    cover_image_url: cover,
    media_urls: fixMediaUrlsField(row.media_urls),
  };
}
