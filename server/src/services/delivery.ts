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
  apiToken: string,
  content: string
): Promise<boolean> {
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
      const ok = await sendChatwootImageMessage(url, apiToken, imageUrl, "");
      if (!ok) console.warn(`[Deliver] Single-image send failed for: ${imageUrl.slice(0, 80)}...`);
    }
  }

  if (successfulDownloads.length === 0) {
    for (const u of imageUrls) await sendChatwootTextMessage(url, apiToken, u);
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
    headers: { api_access_token: apiToken },
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
  apiToken: string,
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
      headers: { api_access_token: apiToken },
      body: formData,
    });
    return resp.ok;
  } catch {
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
 * Delay após cada bloco de imagens antes de continuar com o próximo conteúdo (texto ou outro bloco de imagens).
 * Necessário porque o Chatwoot/WhatsApp leva tempo para processar e entregar mídia ao cliente; se enviarmos texto
 * imediatamente após as imagens, o texto chega antes das fotos no WhatsApp do cliente.
 */
const POST_IMAGES_TEXT_DELAY_MS = 15000;

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
      // Envia TODAS as fotos do bloco em 1 único POST (FormData com múltiplos attachments[]).
      // Isso garante que o cliente receba o álbum agrupado, não fotos separadas chegando em ordem caótica.
      await sendChatwootImagesBatch(msgUrl, apiToken, block.imageUrls, "");

      // Após imagens, aguarda 15s antes de continuar. Mídia leva mais tempo para ser entregue ao
      // WhatsApp do cliente do que texto; sem essa espera, o próximo texto chegaria antes das fotos.
      if (!isLast && hasTimeBudget()) {
        await safeDelay(POST_IMAGES_TEXT_DELAY_MS);
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

      // Gap entre blocos de texto. Não aplicar se o próximo bloco for imagem — a transição
      // texto→imagem deve ser rápida para o cliente ver o texto introdutório seguido logo das fotos.
      if (!isLast && consolidated[i + 1]?.type !== "images" && hasTimeBudget()) {
        const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
        await safeDelay(gapMs);
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
  extractImagesFromMarkdown,
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootMediaMessage,
  sendChatwootPrivateNote,
  getHumanizationConfig,
  replyToChatwoot,
  applyJitter,
};
