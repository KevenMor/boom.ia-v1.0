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
 * Em produção isso vira 404 / mixed content. Reaplica sempre a origem da **página** (igual ao `callAPI` em
 * browser), para `/api/supabase-proxy` bater no mesmo host que serve o painel — não use a origem do
 * `proxyBase` do nexus-client quando o build cai no fallback de outro host.
 */
export function normalizeSuiteGalleryMediaUrl(url: string): string {
  const fixed = ensureSupabaseStoragePublicObjectPath(url.trim());
  if (typeof window === "undefined") {
    return fixed;
  }
  return normalizeSuiteGalleryMediaUrlForOrigin(fixed, window.location.origin);
}

/** Normaliza linhas de mídia vindas da API (JSON string, type ausente, chave URL alternativa). */
export function normalizeSuiteGalleryMediaRows(raw: unknown): SuiteGalleryMedia[] {
  let arr: unknown[] = [];
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p) ? p : [];
    } catch {
      arr = [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  const out: SuiteGalleryMedia[] = [];
  for (const m of arr) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const urlRaw = typeof r.url === "string" ? r.url : typeof r.URL === "string" ? (r.URL as string) : "";
    const url = urlRaw.trim();
    if (!url) continue;
    const t = String(r.type ?? "").toLowerCase();
    let type: "photo" | "video";
    if (t === "video") type = "video";
    else if (t === "photo") type = "photo";
    else type = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? "video" : "photo";
    const row: SuiteGalleryMedia = { url, type };
    if (typeof r.caption === "string" && r.caption.trim()) row.caption = r.caption.trim();
    if (typeof r.llm_send_when === "string" && r.llm_send_when.trim()) row.llm_send_when = r.llm_send_when.trim();
    out.push(row);
  }
  return out;
}

function normalizeSuiteGalleryMedia(raw: unknown): SuiteGalleryMedia[] {
  return normalizeSuiteGalleryMediaRows(raw);
}

/** Garante `media_urls` como array após GET/API legada. */
export function coerceSuiteGalleryFromApi(row: SuiteGallery): SuiteGallery {
  return {
    ...row,
    media_urls: normalizeSuiteGalleryMediaRows(row.media_urls as unknown),
  };
}

function isGalleryPhoto(m: SuiteGalleryMedia): boolean {
  const t = (m.type as string | undefined)?.toLowerCase();
  return t === "photo";
}

function isGalleryVideo(m: SuiteGalleryMedia): boolean {
  const t = (m.type as string | undefined)?.toLowerCase();
  return t === "video";
}

/**
 * URLs candidatas à miniatura da lista (ordem de preferência).
 * Capa primeiro; se estiver 404/expirada, o componente pode tentar as seguintes (fotos em media_urls).
 */
export function getSuiteGalleryThumbnailCandidateUrls(gallery: SuiteGallery): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    const norm = normalizeSuiteGalleryMediaUrl(t);
    if (!out.includes(norm)) out.push(norm);
  };

  push(gallery.cover_image_url);

  const media = normalizeSuiteGalleryMedia(gallery.media_urls as unknown);
  for (const m of media) {
    if (isGalleryPhoto(m) && m.url?.trim()) push(m.url.trim());
  }
  for (const m of media) {
    if (m.url?.trim() && !isGalleryVideo(m)) push(m.url.trim());
  }
  return out;
}

/** Primeiro candidato a miniatura (ver getSuiteGalleryThumbnailCandidateUrls). */
export function getSuiteGalleryThumbnailUrl(gallery: SuiteGallery): string | null {
  const urls = getSuiteGalleryThumbnailCandidateUrls(gallery);
  return urls[0] ?? null;
}
