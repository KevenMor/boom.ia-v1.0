import { toDirectDownloadUrl } from "../utils/videoUrl.js";
import {
  VIDEO_SIZE_LIMIT_BYTES,
  MAX_VIDEO_BYTES,
  classifyVideoDelivery,
} from "../utils/videoDeliveryLimits.js";

/** Mensagem curta após enviar vídeo como documento (>16 MB), para soar humano no WhatsApp. */
const VIDEO_DOCUMENT_FOLLOWUP_MESSAGES = [
  "Me encaminharam o vídeo, mas ficou um pouquinho grande, então mandei como arquivo, tudo bem?",
  "O vídeo veio um pouco pesado; enviei como arquivo pra não perder qualidade. Qualquer coisa, me chama!",
  "Passaram o vídeo aqui e ficou grandinho pro formato normal do Zap — mandei como arquivo. Consegue abrir aí?",
  "Encaminharam o vídeo pra mim e, pra não comprimir demais, mandei como arquivo. Se precisar de ajuda, é só falar!",
] as const;

function pickRandomVideoFollowup(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)] ?? messages[0];
}

function humanizedVideoLinkMessage(publicUrl: string, reason: "fetch_or_send" | "oversized"): string {
  if (reason === "oversized") {
    const lines = [
      `O vídeo ficou bem grande pro envio automático aqui. Melhor pelo link, pra você ver com qualidade boa:\n\n${publicUrl}`,
      `Passou do tamanho que o app aceita no automático — segue o link do vídeo completo:\n\n${publicUrl}`,
    ];
    return pickRandomVideoFollowup(lines);
  }
  const lines = [
    `Não consegui mandar o vídeo direto aqui. Segue o link pra você assistir:\n\n${publicUrl}`,
    `Daqui não rolou enviar o arquivo do vídeo, então te mando pelo link:\n\n${publicUrl}`,
  ];
  return pickRandomVideoFollowup(lines);
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

function extractImagesFromMarkdown(text: string): { textOnly: string; imageUrls: string[] } {
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
  const imageUrls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(text)) !== null) {
    if (match[1]) imageUrls.push(match[1].trim());
  }
  const textOnly = text.replace(imageRegex, "").replace(/\n{3,}/g, "\n\n").trim();
  return { textOnly, imageUrls };
}

async function sendChatwootTextMessage(
  url: string,
  authHeaders: Record<string, string>,
  content: string
): Promise<boolean> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
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
  authHeaders: Record<string, string>,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  return sendChatwootImagesBatch(url, authHeaders, [imageUrl], caption);
}

async function sendChatwootImagesBatch(
  url: string,
  authHeaders: Record<string, string>,
  imageUrls: string[],
  caption?: string
): Promise<boolean> {
  if (!imageUrls.length) return true;
  console.warn(`[Deliver] sendChatwootImagesBatch: attempting ${imageUrls.length} image(s)`);
  const results = await Promise.allSettled(
    imageUrls.map(async (imageUrl) => {
      const parsedUrl = new URL(imageUrl);
      const imgResp = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });
      if (!imgResp.ok) {
        console.warn(`[Deliver] Image download failed ${imgResp.status}: ${imageUrl.slice(0, 80)}...`);
        return null;
      }
      const blob = await imgResp.blob();
      const filename = parsedUrl.pathname.split("/").pop() || "image.jpg";
      return { blob, filename, url: imageUrl };
    })
  );

  const successfulDownloads = results
    .filter((d): d is PromiseFulfilledResult<{ blob: Blob; filename: string; url: string } | null> => d.status === "fulfilled")
    .map((d) => d.value)
    .filter((d): d is { blob: Blob; filename: string; url: string } => d !== null);

  const failedUrls = imageUrls.filter(
    (u) => !successfulDownloads.some((d) => d.url === u)
  );
  if (failedUrls.length > 0) {
    console.warn(`[Deliver] ${failedUrls.length}/${imageUrls.length} image(s) failed to download. Trying one-by-one.`);
    for (const imageUrl of failedUrls) {
      const ok = await sendChatwootImageMessage(url, authHeaders, imageUrl, "");
      if (!ok) console.warn(`[Deliver] Single-image send failed for: ${imageUrl.slice(0, 80)}...`);
    }
  }

  if (successfulDownloads.length === 0) {
    for (const u of imageUrls) await sendChatwootTextMessage(url, authHeaders, u);
    return false;
  }

  console.warn(`[Deliver] sendChatwootImagesBatch: sending ${successfulDownloads.length}/${imageUrls.length} image(s) in one message`);
  const formData = new FormData();
  if (caption && caption.trim()) formData.append("content", caption.trim());
  formData.append("message_type", "outgoing");
  formData.append("private", "false");
  for (const { blob, filename } of successfulDownloads) {
    formData.append("attachments[]", blob, filename);
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders },
    body: formData,
  });

  if (!resp.ok) {
    console.error(`[Deliver] Batch image msg error ${resp.status}:`, await resp.text());
    return false;
  }
  return true;
}

async function sendChatwootMediaMessage(
  url: string,
  authHeaders: Record<string, string>,
  mediaUrl: string,
  contentType = "video/mp4",
  caption?: string
): Promise<boolean> {
  try {
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) return false;
    const mediaBlob = await mediaResp.blob();
    const parsedUrl = new URL(mediaUrl);
    const filename = parsedUrl.pathname.split("/").pop() || "media.mp4";
    const formData = new FormData();
    if (caption && caption.trim()) formData.append("content", caption.trim());
    formData.append("message_type", "outgoing");
    formData.append("private", "false");
    formData.append("attachments[]", new Blob([await mediaBlob.arrayBuffer()], { type: contentType }), filename);

    const resp = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders },
      body: formData,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Envia vídeo ao Chatwoot com suporte a Google Drive, tamanhos até 100MB e fallback para link.
 * - Até 16MB: envia como vídeo (reprodução nativa)
 * - 16–100MB: envia como documento (application/octet-stream); em seguida, mensagem humanizada curta
 * - Se falhar: envia texto humanizado com link
 */
async function sendChatwootVideoMessage(
  msgUrl: string,
  authHeaders: Record<string, string>,
  videoUrl: string,
  sendTextMessage: (url: string, auth: Record<string, string>, content: string) => Promise<boolean>
): Promise<boolean> {
  const directUrl = toDirectDownloadUrl(videoUrl);
  try {
    const mediaResp = await fetch(directUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!mediaResp.ok) {
      console.warn(`[Deliver] Video fetch failed ${mediaResp.status}: ${directUrl.slice(0, 80)}...`);
      await sendTextMessage(msgUrl, authHeaders, humanizedVideoLinkMessage(videoUrl, "fetch_or_send"));
      return false;
    }
    const mediaBlob = await mediaResp.blob();
    const sizeBytes = mediaBlob.size;

    if (sizeBytes > MAX_VIDEO_BYTES) {
      console.warn(`[Deliver] Video exceeds 100MB (${(sizeBytes / 1024 / 1024).toFixed(1)}MB), sending link`);
      await sendTextMessage(msgUrl, authHeaders, humanizedVideoLinkMessage(videoUrl, "oversized"));
      return true;
    }

    const deliveryClass = classifyVideoDelivery(sizeBytes);
    const contentType = deliveryClass === "native_video" ? "video/mp4" : "application/octet-stream";
    const parsedUrl = new URL(directUrl);
    const filename = parsedUrl.pathname.split("/").pop() || "video.mp4";

    const formData = new FormData();
    formData.append("message_type", "outgoing");
    formData.append("private", "false");
    formData.append("attachments[]", new Blob([await mediaBlob.arrayBuffer()], { type: contentType }), filename);

    const resp = await fetch(msgUrl, {
      method: "POST",
      headers: { ...authHeaders },
      body: formData,
    });

    if (!resp.ok) {
      console.warn(`[Deliver] Video send failed ${resp.status}, sending link as fallback`);
      await sendTextMessage(msgUrl, authHeaders, humanizedVideoLinkMessage(videoUrl, "fetch_or_send"));
      return false;
    }

    if (contentType === "application/octet-stream") {
      await new Promise((r) => setTimeout(r, applyJitter(800)));
      await sendTextMessage(msgUrl, authHeaders, pickRandomVideoFollowup(VIDEO_DOCUMENT_FOLLOWUP_MESSAGES));
    }

    return true;
  } catch (e) {
    console.warn(`[Deliver] Video send error:`, (e as Error)?.message, "— sending link as fallback");
    await sendTextMessage(msgUrl, authHeaders, humanizedVideoLinkMessage(videoUrl, "fetch_or_send"));
    return false;
  }
}

async function setChatwootTyping(
  chatwootUrl: string,
  authHeaders: Record<string, string>,
  accountId: string,
  conversationId: number,
  status: "on" | "off"
): Promise<void> {
  try {
    const baseUrl = chatwootUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_typing_status`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
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
  authHeaders: Record<string, string>,
  accountId: string | number,
  conversationId: string | number,
  content: string
): Promise<boolean> {
  try {
    const baseUrl = chatwootUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
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

const MAX_IMAGES_PER_BATCH = 1;
/** Delay entre cada foto enviada ao Chatwoot/WhatsApp (ms), para dar tempo de processar e evitar que só as primeiras sejam entregues. */
const IMAGE_BLOCK_DELAY_MS = 2200;

interface ConsolidatedPart {
  type: "text" | "images";
  content?: string;
  imageUrls?: string[];
}

function consolidateImageParts(parts: string[]): ConsolidatedPart[] {
  const result: ConsolidatedPart[] = [];
  let pendingImages: string[] = [];

  const flushImages = () => {
    if (pendingImages.length > 0) {
      result.push({ type: "images", imageUrls: [...pendingImages] });
      pendingImages = [];
    }
  };

  for (const part of parts) {
    if (!part?.trim()) continue;
    const { textOnly, imageUrls } = extractImagesFromMarkdown(part);

    if (textOnly.trim().length > 60 && imageUrls.length > 0) {
      flushImages();
      result.push({ type: "text", content: textOnly.trim() });
      pendingImages.push(...imageUrls);
    } else if (imageUrls.length > 0) {
      pendingImages.push(...imageUrls);
    } else if (textOnly.trim()) {
      flushImages();
      result.push({ type: "text", content: textOnly.trim() });
    }
  }
  flushImages();
  return result;
}

async function replyToChatwoot(
  chatwootUrl: string,
  authHeaders: Record<string, string>,
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
  const MAX_BUDGET_MS = 28000;
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

  // #region agent log
  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faf2ea'},body:JSON.stringify({sessionId:'faf2ea',location:'delivery.ts:consolidated',message:'consolidated parts order',data:{totalParts:consolidated.length,types:consolidated.map(b=>b.type),imageCounts:consolidated.map(b=>b.imageUrls?.length??0),textPreviews:consolidated.map(b=>b.content?.slice(0,60)??null),totalImageUrls},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  let prevBlockWasImages = false;
  let prevImageCount = 0;

  for (let i = 0; i < consolidated.length; i++) {
    const block = consolidated[i];
    const isLast = i === consolidated.length - 1;

    if (block.type === "images" && block.imageUrls?.length) {
      const urls = block.imageUrls;
      // #region agent log
      fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faf2ea'},body:JSON.stringify({sessionId:'faf2ea',location:'delivery.ts:imageBlock',message:'sending image block',data:{blockIdx:i,imageCount:urls.length,budgetRemaining:MAX_BUDGET_MS-(Date.now()-startTime)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      for (let j = 0; j < urls.length; j++) {
        await sendChatwootImagesBatch(msgUrl, authHeaders, [urls[j]], "");
        if (j < urls.length - 1) {
          await safeDelay(applyJitter(IMAGE_BLOCK_DELAY_MS));
        }
      }
      prevBlockWasImages = true;
      prevImageCount = urls.length;
      if (!isLast) {
        const postImageDelay = Math.max(IMAGE_BLOCK_DELAY_MS, prevImageCount * 800);
        // #region agent log
        fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faf2ea'},body:JSON.stringify({sessionId:'faf2ea',location:'delivery.ts:postImageDelay',message:'waiting after image block before next part',data:{blockIdx:i,postImageDelay,prevImageCount,budgetRemaining:MAX_BUDGET_MS-(Date.now()-startTime)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        await new Promise((resolve) => setTimeout(resolve, postImageDelay));
      }
    } else if (block.type === "text" && block.content) {
      // #region agent log
      fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'faf2ea'},body:JSON.stringify({sessionId:'faf2ea',location:'delivery.ts:textBlock',message:'sending text block',data:{blockIdx:i,textPreview:block.content.slice(0,60),prevBlockWasImages,prevImageCount,budgetRemaining:MAX_BUDGET_MS-(Date.now()-startTime)},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      if (humanization.typingDelayMs > 0 && hasTimeBudget()) {
        await setChatwootTyping(chatwootUrl, authHeaders, accountId, conversationId, "on");
        await safeDelay(applyJitter(humanization.typingDelayMs));
      }
      await sendChatwootTextMessage(msgUrl, authHeaders, block.content);
      if (humanization.typingDelayMs > 0) {
        setChatwootTyping(chatwootUrl, authHeaders, accountId, conversationId, "off").catch(() => {});
      }
      prevBlockWasImages = false;
      prevImageCount = 0;
    }

    if (!isLast && hasTimeBudget()) {
      const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
      await safeDelay(gapMs);
    }
  }
}

export {
  extractImagesFromMarkdown,
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootMediaMessage,
  sendChatwootVideoMessage,
  sendChatwootPrivateNote,
  getHumanizationConfig,
  replyToChatwoot,
  applyJitter,
};
