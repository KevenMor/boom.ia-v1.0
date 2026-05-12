import { normalizeStorageUrlForExternalUse } from "../lib/supabase-storage-public-url.js";
import { createNexusClient } from "../services/supabase.js";

type Supabase = ReturnType<typeof createNexusClient>;

type MediaItem = { url?: string; type?: string; caption?: string };

/** Galeria "imagem inicial conversa" (ou variações no painel) — 1ª foto = markdown no 1º turno. */
function isWelcomeGalleryName(name: string): boolean {
  const n = name.toLowerCase().normalize("NFC");
  if (/\bwelcome\b|imagem (de|da) abertura|abertura (da )?conversa|primeira (foto|imagem)/.test(n)) return true;
  if (/\bimagem\b/.test(n) && /\binicial\b/.test(n)) return true;
  if (/(inicial|primeir[ao])/.test(n) && /(conversa|contato|chat|whatsapp|mensagem)/.test(n)) return true;
  return false;
}

/**
 * Retorna Markdown `![...](url)\n\n` para injeção no primeiro SSE do assistente, ou string vazia.
 */
export async function getWelcomeConversationImageMarkdown(
  supabase: Supabase,
  tenantId: string
): Promise<string> {
  if (!tenantId) return "";
  const { data: rows, error } = await supabase
    .from("suite_galleries")
    .select("name, cover_image_url, media_urls, display_order")
    .eq("tenant_id", tenantId)
    .order("display_order", { ascending: true })
    .limit(50);

  if (error || !Array.isArray(rows) || rows.length === 0) {
    if (error) {
      console.warn("[suite-gallery-welcome] query:", error.message);
    }
    return "";
  }

  const gallery = rows.find(
    (g) => typeof (g as { name?: string }).name === "string" && isWelcomeGalleryName((g as { name: string }).name)
  ) as
    | {
        name?: string;
        cover_image_url?: string | null;
        media_urls?: unknown;
      }
    | undefined;

  if (!gallery) return "";

  const label = (gallery.name || "Vale Suíço Resort").trim() || "Vale Suíço Resort";
  const mediaArr: MediaItem[] = Array.isArray(gallery.media_urls) ? (gallery.media_urls as MediaItem[]) : [];
  const photos = mediaArr.filter((m) => m && typeof m.url === "string" && (m.type === "photo" || !m.type));
  const cover =
    typeof gallery.cover_image_url === "string" && gallery.cover_image_url.trim()
      ? normalizeStorageUrlForExternalUse(gallery.cover_image_url.trim())
      : "";
  const firstPhotoUrl = photos[0]?.url
    ? normalizeStorageUrlForExternalUse(String(photos[0].url).trim())
    : "";
  const anyWithUrl = mediaArr.find((m) => m && typeof m.url === "string" && (m as MediaItem).url);
  const fallbackUrl = anyWithUrl
    ? normalizeStorageUrlForExternalUse(String((anyWithUrl as MediaItem).url).trim())
    : "";

  const imageUrl = cover || firstPhotoUrl || fallbackUrl;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return "";

  return `![${label}](${imageUrl})\n\n`;
}

/** URL em `![...](url)` do markdown de abertura. */
export function welcomeConversationImageUrlFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/!\[.*?\]\((https?:\/\/[^)\s]+)\)/);
  return match?.[1]?.trim() ?? null;
}

/** Evita segunda capa quando chat-local/repaired já injetaram a mesma URL. */
export function responseAlreadyIncludesWelcomeImage(content: string, welcomeMarkdown: string): boolean {
  const welcomeTrimmed = welcomeMarkdown.trim();
  if (!welcomeTrimmed || !content?.trim()) return false;
  if (content.startsWith(welcomeTrimmed)) return true;
  const url = welcomeConversationImageUrlFromMarkdown(welcomeTrimmed);
  return !!url && content.includes(url);
}
