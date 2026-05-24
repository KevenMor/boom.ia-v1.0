import { normalizeStorageUrlForExternalUse } from "../lib/supabase-storage-public-url.js";

/** Mensagem quando download/upload de mídia falha — nunca enviar URL crua ao cliente. */
const MEDIA_DELIVERY_FAILED_PT =
  "Não consegui enviar o arquivo de mídia agora. Quer que eu tente de novo em instantes?";

const VIDEO_IN_URL_RE = /\.(mp4|webm|mov)(\?|#|$)/i;

function stripOuterWrappers(url: string): string {
  let t = url.trim();
  if ((t.startsWith("<") && t.endsWith(">")) || (t.startsWith("(") && t.endsWith(")"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Remove URLs de vídeo do texto e devolve como anexos (nunca como link na bolha).
 * Cobre: markdown [legenda](url.mp4), ![…](url.mp4), linha só com URL, <url>, (url)
 * e URL inline no meio de texto (ex.: "Esse vídeo mostra o resort. https://.../video.mp4?t=123").
 */
function extractVideoUrlsFromText(text: string): { textOnly: string; videoUrls: string[] } {
  const videoUrls: string[] = [];
  let t = text;

  const mdVideo =
    /!?\[([^\]]*)\]\((https?:\/\/[^)\s]+\.(?:mp4|webm|mov)(?:\?[^)\s]*)?)\)/gi;
  t = t.replace(mdVideo, (_full, _label, url: string) => {
    if (url) videoUrls.push(url.trim());
    return "";
  });

  const inlineVideoUrl =
    /https?:\/\/[^\s<>"']+\.(?:mp4|webm|mov)(?:\?[^\s<>"']*)?(?:#[^\s<>"']*)?/gi;

  const lines = t.split(/\r?\n/);
  const remainingLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      remainingLines.push(line);
      continue;
    }
    const inner = stripOuterWrappers(trimmed);
    let lineRemainder = inner;
    let inlineMatch: RegExpExecArray | null;
    inlineVideoUrl.lastIndex = 0;
    const lineVideoUrls: string[] = [];
    while ((inlineMatch = inlineVideoUrl.exec(inner)) !== null) {
      const url = inlineMatch[0].trim();
      if (url && !lineVideoUrls.includes(url)) lineVideoUrls.push(url);
    }
    if (lineVideoUrls.length > 0) {
      for (const url of lineVideoUrls) {
        videoUrls.push(url);
        lineRemainder = lineRemainder.replace(url, "");
      }
      lineRemainder = lineRemainder.trim();
      if (lineRemainder) remainingLines.push(lineRemainder);
      continue;
    }
    remainingLines.push(line);
  }

  t = remainingLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const deduped = [...new Set(videoUrls.map((u) => u.trim()).filter(Boolean))];
  return { textOnly: t, videoUrls: deduped };
}

function extractImagesFromMarkdown(text: string): { textOnly: string; imageUrls: string[] } {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  const imageUrls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(text)) !== null) {
    if (match[1]) imageUrls.push(match[1].trim());
  }
  const textOnly = text.replace(imageRegex, "").replace(/\n{3,}/g, "\n\n").trim();

  // Debug: log quando encontrar imagens
  if (imageUrls.length > 0) {
    console.log("[Delivery][extractImagesFromMarkdown] Encontradas", imageUrls.length, "imagens:", imageUrls.map(u => u.substring(0, 60)));
  }

  return { textOnly, imageUrls };
}

async function sendChatwootTextMessage(
  url: string,
  apiToken: string,
  content: string
): Promise<boolean> {
  if (VIDEO_IN_URL_RE.test(content)) {
    console.warn(
      `[Deliver][LEAK] URL de vídeo escapou para mensagem de texto — verificar extractVideoUrlsFromText. ` +
        `Trecho: ${content.slice(0, 240).replace(/\s+/g, " ")}`
    );
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_access_token: apiToken },
    body: JSON.stringify({ content, message_type: "outgoing", private: false }),
  });
  if (!resp.ok) {
    console.error(`[Deliver] Text msg error ${resp.status}:`, await resp.text());
    return false;
  }
  return true;
}

async function sendChatwootImageMessage(
  url: string,
  apiToken: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  return sendChatwootImagesBatch(url, apiToken, [imageUrl], caption);
}

async function sendChatwootImagesBatch(
  url: string,
  apiToken: string,
  imageUrls: string[],
  caption?: string
): Promise<boolean> {
  if (!imageUrls.length) return true;
  console.warn(`[Deliver] sendChatwootImagesBatch: attempting ${imageUrls.length} image(s)`);
  // WhatsApp bridge only forwards the FIRST attachment of a Chatwoot message.
  // Send each image as a separate POST so all arrive on WhatsApp.
  let successCount = 0;
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    try {
      const fetchUrl = normalizeStorageUrlForExternalUse(imageUrl);
      const parsedUrl = new URL(fetchUrl);
      const imgResp = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });
      if (!imgResp.ok) {
        console.warn(`[Deliver] Image download failed ${imgResp.status}: ${fetchUrl.slice(0, 80)}...`);
        await sendChatwootTextMessage(url, apiToken, MEDIA_DELIVERY_FAILED_PT);
        continue;
      }
      const blob = await imgResp.blob();
      const filename = parsedUrl.pathname.split("/").pop() || "image.jpg";
      const formData = new FormData();
      if (i === 0 && caption && caption.trim()) formData.append("content", caption.trim());
      formData.append("message_type", "outgoing");
      formData.append("private", "false");
      formData.append("attachments[]", blob, filename);
      const resp = await fetch(url, {
        method: "POST",
        headers: { api_access_token: apiToken },
        body: formData,
      });
      if (!resp.ok) {
        console.error(`[Deliver] Image msg error ${resp.status}:`, await resp.text());
        await sendChatwootTextMessage(url, apiToken, MEDIA_DELIVERY_FAILED_PT);
      } else {
        successCount++;
        console.warn(`[Deliver] Image ${i + 1}/${imageUrls.length} sent OK`);
      }
    } catch (e) {
      console.warn(`[Deliver] Image send exception: ${(e as Error)?.message?.slice(0, 120)}`);
      await sendChatwootTextMessage(url, apiToken, MEDIA_DELIVERY_FAILED_PT);
    }
  }
  console.warn(`[Deliver] sendChatwootImagesBatch: sent ${successCount}/${imageUrls.length} image(s)`);
  return successCount > 0;
}

async function sendChatwootMediaMessage(
  url: string,
  apiToken: string,
  mediaUrl: string,
  contentType = "video/mp4",
  caption?: string
): Promise<boolean> {
  try {
    const fetchUrl = normalizeStorageUrlForExternalUse(mediaUrl);
    const parsedUrl = new URL(fetchUrl);
    const mediaResp = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
        Accept: "video/*,*/*;q=0.8",
      },
    });
    if (!mediaResp.ok) {
      console.warn(`[Deliver] Video download failed ${mediaResp.status}: ${fetchUrl.slice(0, 96)}…`);
      return false;
    }
    const mediaBlob = await mediaResp.blob();
    const headerCt = mediaResp.headers.get("content-type")?.split(";")[0]?.trim();
    const blobType = headerCt && headerCt !== "application/octet-stream" ? headerCt : contentType;
    const filename = parsedUrl.pathname.split("/").pop()?.replace(/[?#].*$/, "") || "media.mp4";
    const formData = new FormData();
    if (caption && caption.trim()) formData.append("content", caption.trim());
    formData.append("message_type", "outgoing");
    formData.append("private", "false");
    formData.append("attachments[]", new Blob([await mediaBlob.arrayBuffer()], { type: blobType }), filename);

    const resp = await fetch(url, {
      method: "POST",
      headers: { api_access_token: apiToken },
      body: formData,
    });
    if (!resp.ok) {
      console.warn(`[Deliver] Video Chatwoot upload failed ${resp.status}:`, (await resp.text()).slice(0, 200));
    }
    return resp.ok;
  } catch (e) {
    console.warn(`[Deliver] Video send exception: ${(e as Error)?.message?.slice(0, 120)}`);
    return false;
  }
}

async function setChatwootTyping(
  chatwootUrl: string,
  apiToken: string,
  accountId: string,
  conversationId: number,
  status: "on" | "off"
): Promise<void> {
  try {
    const baseUrl = chatwootUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_typing_status`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_access_token: apiToken },
      body: JSON.stringify({ typing_status: status }),
    });
    if (!resp.ok) console.warn(`[Deliver] Typing ${status} failed ${resp.status}`);
  } catch (e) {
    console.warn(`[Deliver] Typing ${status} error:`, e);
  }
}

/**
 * Envia uma nota privada no Chatwoot (só a equipe vê).
 * Usada para notificações automáticas (ex.: agendamento criado).
 */
async function sendChatwootPrivateNote(
  chatwootUrl: string,
  apiToken: string,
  accountId: string | number,
  conversationId: string | number,
  content: string
): Promise<boolean> {
  try {
    const baseUrl = chatwootUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_access_token: apiToken },
      body: JSON.stringify({ content, message_type: "outgoing", private: true }),
    });
    if (!resp.ok) {
      console.error("[Deliver] Private note error", resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Deliver] Private note exception:", e);
    return false;
  }
}

function applyJitter(ms: number): number {
  return Math.round(ms * (0.7 + Math.random() * 0.6));
}

interface HumanizationConfig {
  readDelayMs: number;
  typingDelayMs: number;
  blockGapMs: number;
}

function getHumanizationConfig(cfg: Record<string, any>): HumanizationConfig {
  return {
    readDelayMs: Number(cfg.read_delay_ms) || 0,
    typingDelayMs: Number(cfg.typing_delay_ms) || 0,
    blockGapMs: Number(cfg.block_gap_ms) || 0,
  };
}

/**
 * Estratégia de delays para entrega ordenada no WhatsApp via Chatwoot:
 *
 * Texto → Texto    : blockGapMs (padrão 2 s) com typing indicator — humanização.
 * Texto → Imagens  : PRE_MEDIA_GAP_MS (2 s) — deixa o texto chegar ao WhatsApp antes
 *                    de começar o download/upload das imagens.
 * Texto → Vídeo    : PRE_MEDIA_GAP_MS (2 s) — idem.
 * Imagens → qualquer: POST_IMAGES_DELAY_MS (15 s) — Chatwoot ainda está entregando as
 *                    imagens ao WhatsApp; sem esse delay o texto seguinte chegaria antes.
 *                    EXCEÇÃO: quando ambos os blocos (atual e próximo) são `images` com
 *                    `content` (legenda integrada), usa POST_IMAGES_WITH_CAPTION_DELAY_MS (5 s).
 * Vídeo → qualquer : POST_VIDEO_DELAY_MS (20 s) — vídeos são maiores e levam mais tempo
 *                    para o Chatwoot concluir a entrega ao WhatsApp; 15 s não é suficiente.
 */
const PRE_MEDIA_GAP_MS = 2000;
const POST_IMAGES_DELAY_MS = 15000;
const POST_IMAGES_WITH_CAPTION_DELAY_MS = 5000;
const POST_VIDEO_DELAY_MS = 20000;

interface ConsolidatedPart {
  type: "text" | "images" | "video";
  /** Texto; em blocos `images`, vira legenda no primeiro anexo (WhatsApp/Chatwoot). */
  content?: string;
  imageUrls?: string[];
  videoUrl?: string;
}

function shouldPromoteTextToImageCaption(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.includes("\n")) return false;
  return normalized.length <= 80;
}

/** Junta bloco só-imagem + texto curto seguinte num único envio (legenda na foto). */
function mergeAdjacentImageAndTextBlocks(blocks: ConsolidatedPart[]): ConsolidatedPart[] {
  const out: ConsolidatedPart[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const n = blocks[i + 1];
    if (
      b.type === "images" &&
      b.imageUrls &&
      b.imageUrls.length === 1 &&
      n?.type === "text" &&
      n.content?.trim() &&
      !b.content &&
      shouldPromoteTextToImageCaption(n.content)
    ) {
      out.push({ type: "images", imageUrls: b.imageUrls, content: n.content.trim() });
      i++;
    } else {
      out.push(b);
    }
  }
  return out;
}

function consolidateImageParts(parts: string[]): ConsolidatedPart[] {
  const result: ConsolidatedPart[] = [];
  let pendingImages: string[] = [];
  /** WhatsApp via Chatwoot: um anexo por mensagem — cada URL vira um POST separado (igual imagens). */
  const seenVideoUrls = new Set<string>();

  const flushImages = () => {
    if (pendingImages.length > 0) {
      result.push({ type: "images", imageUrls: [...pendingImages] });
      pendingImages = [];
    }
  };

  for (const part of parts) {
    if (!part?.trim()) continue;
    const { textOnly: afterImages, imageUrls: rawMdUrls } = extractImagesFromMarkdown(part);
    const fromMdVideo = rawMdUrls.filter((u) => VIDEO_IN_URL_RE.test(u));
    const imageUrls = rawMdUrls.filter((u) => !VIDEO_IN_URL_RE.test(u));
    const { textOnly, videoUrls } = extractVideoUrlsFromText(afterImages);
    const mergedVideoUrls = [...new Set([...fromMdVideo, ...videoUrls])];

    if (imageUrls.length > 0) {
      flushImages();
      if (textOnly.trim()) {
        result.push({ type: "images", imageUrls: [...imageUrls], content: textOnly.trim() });
      } else {
        pendingImages.push(...imageUrls);
      }
    } else if (textOnly.trim()) {
      flushImages();
      result.push({ type: "text", content: textOnly.trim() });
    }

    for (const raw of mergedVideoUrls) {
      const videoUrl = raw.trim();
      if (!videoUrl || seenVideoUrls.has(videoUrl)) continue;
      seenVideoUrls.add(videoUrl);
      flushImages();
      result.push({ type: "video", videoUrl });
    }
  }
  flushImages();
  return mergeAdjacentImageAndTextBlocks(result);
}

async function replyToChatwoot(
  chatwootUrl: string,
  apiToken: string,
  accountId: string,
  conversationId: number,
  content: string,
  messageParts: string[],
  humanization: HumanizationConfig = { readDelayMs: 0, typingDelayMs: 0, blockGapMs: 0 }
) {
  const baseUrl = chatwootUrl.replace(/\/+$/, "");
  const msgUrl = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const rawParts = messageParts.length > 0 ? messageParts : [content];
  // Expandir cada part em blocos por parágrafo (linha em branco), para múltiplas bolhas no WhatsApp mesmo sem <<MSG_SPLIT>>
  const parts = rawParts.flatMap((p) =>
    p
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (parts.length === 0 && content.trim()) parts.push(content.trim());


  const startTime = Date.now();
  const MAX_BUDGET_MS = 90000;
  const hasTimeBudget = () => Date.now() - startTime < MAX_BUDGET_MS;

  const safeDelay = async (ms: number) => {
    if (ms <= 0 || !hasTimeBudget()) return;
    const capped = Math.min(ms, MAX_BUDGET_MS - (Date.now() - startTime));
    if (capped <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, capped));
  };

  if (humanization.readDelayMs > 0 && hasTimeBudget()) {
    await safeDelay(applyJitter(humanization.readDelayMs));
  }

  const consolidated = consolidateImageParts(parts);

  const totalImageUrls = consolidated
    .filter((b) => b.type === "images" && b.imageUrls?.length)
    .reduce((acc, b) => acc + (b.imageUrls?.length ?? 0), 0);
  if (totalImageUrls > 0) {
    console.warn(`[Deliver] replyToChatwoot: total image URLs to send=${totalImageUrls}, blocks=${consolidated.filter((b) => b.type === "images").length}`);
  }

  for (let i = 0; i < consolidated.length; i++) {
    const block = consolidated[i];
    const isLast = i === consolidated.length - 1;

    if (block.type === "images" && block.imageUrls?.length) {
      await sendChatwootImagesBatch(msgUrl, apiToken, block.imageUrls, block.content?.trim() || "");
      // Após imagens: aguarda 15 s para Chatwoot concluir entrega ao WhatsApp antes do próximo bloco.
      // EXCEÇÃO: se o próximo bloco também é `images` com `content` (legenda integrada),
      // usa 5 s em vez de 15 s (fotos com legenda entregam mais rápido).
      if (!isLast && hasTimeBudget()) {
        const next = consolidated[i + 1];
        const useShortDelay =
          block.content?.trim() &&
          next?.type === "images" &&
          next.content?.trim();
        const delayMs = useShortDelay ? POST_IMAGES_WITH_CAPTION_DELAY_MS : POST_IMAGES_DELAY_MS;
        await safeDelay(delayMs);
      }
    } else if (block.type === "text" && block.content) {
      if (humanization.typingDelayMs > 0 && hasTimeBudget()) {
        await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "on");
        await safeDelay(applyJitter(humanization.typingDelayMs));
      }
      await sendChatwootTextMessage(msgUrl, apiToken, block.content);
      if (humanization.typingDelayMs > 0) {
        setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "off").catch(() => {});
      }

      if (!isLast && hasTimeBudget()) {
        const nextType = consolidated[i + 1]?.type;
        if (nextType === "images" || nextType === "video") {
          // Pequeno gap antes de mídia: garante que o texto chegou ao WhatsApp antes
          // de iniciarmos o download/upload da mídia.
          await safeDelay(applyJitter(PRE_MEDIA_GAP_MS));
        } else {
          // Gap normal entre bolhas de texto.
          const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
          await safeDelay(gapMs);
        }
      }
    } else if (block.type === "video" && block.videoUrl) {
      console.warn(`[Deliver] Sending video: ${block.videoUrl.slice(0, 100)}...`);
      const ok = await sendChatwootMediaMessage(msgUrl, apiToken, block.videoUrl, "video/mp4");
      if (!ok) {
        console.warn("[Deliver] Video send failed — not sending raw URL to customer");
        await sendChatwootTextMessage(msgUrl, apiToken, MEDIA_DELIVERY_FAILED_PT);
      }
      // Após vídeo: aguarda 20 s (mais que imagens — arquivo maior, Chatwoot leva mais
      // tempo para concluir a entrega ao WhatsApp) antes do próximo bloco.
      if (!isLast && hasTimeBudget()) {
        await safeDelay(POST_VIDEO_DELAY_MS);
      }
    }
  }
}

/**
 * Headers de autenticação para API Chatwoot.
 * Por padrão usa api_access_token (documentação oficial).
 * Se cfg.chatwoot_use_bearer === true, usa Authorization: Bearer (para Nginx sem underscores_in_headers).
 */
export function getChatwootAuthHeaders(apiToken: string, cfg?: Record<string, unknown>): Record<string, string> {
  const useBearer = cfg && (cfg.chatwoot_use_bearer === true || cfg.chatwoot_auth_style === "bearer");
  return useBearer ? { Authorization: `Bearer ${apiToken}` } : { api_access_token: apiToken };
}

export {
  MEDIA_DELIVERY_FAILED_PT,
  extractVideoUrlsFromText,
  extractImagesFromMarkdown,
  consolidateImageParts,
  shouldPromoteTextToImageCaption,
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootMediaMessage,
  sendChatwootPrivateNote,
  getHumanizationConfig,
  replyToChatwoot,
  applyJitter,
};
