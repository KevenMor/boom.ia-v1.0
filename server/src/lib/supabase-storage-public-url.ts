/** Alinha com src/lib/suite-gallery-display.ts — buckets públicos exigem …/object/public/{bucket}/… */
export function ensureSupabaseStoragePublicObjectPath(url: string): string {
  if (!url.includes("/storage/v1/object/")) return url;
  return url.replace(
    /\/storage\/v1\/object\/(?!public\/|sign\/|authenticated\/|upload\/|info\/|list-v2\/|list\/|move|copy)/g,
    "/storage/v1/object/public/"
  );
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
