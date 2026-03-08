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
  const downloads = await Promise.allSettled(
    imageUrls.map(async (imageUrl) => {
      const parsedUrl = new URL(imageUrl);
      const imgResp = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: `${parsedUrl.protocol}//${parsedUrl.host}/`,
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });
      if (!imgResp.ok) return null;
      const blob = await imgResp.blob();
      const filename = parsedUrl.pathname.split("/").pop() || "image.jpg";
      return { blob, filename };
    })
  );

  const successfulDownloads = downloads
    .filter((d): d is PromiseFulfilledResult<{ blob: Blob; filename: string } | null> => d.status === "fulfilled")
    .map((d) => d.value)
    .filter((d): d is { blob: Blob; filename: string } => d !== null);

  if (successfulDownloads.length === 0) {
    for (const u of imageUrls) await sendChatwootTextMessage(url, apiToken, u);
    return false;
  }

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

const MAX_IMAGES_PER_BATCH = 10;

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
  const parts = messageParts.length > 0 ? messageParts : [content];

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

  for (let i = 0; i < consolidated.length; i++) {
    const block = consolidated[i];

    if (block.type === "images" && block.imageUrls?.length) {
      const urls = block.imageUrls;
      if (urls.length <= MAX_IMAGES_PER_BATCH) {
        await sendChatwootImagesBatch(msgUrl, apiToken, urls, "");
      } else {
        for (let j = 0; j < urls.length; j += MAX_IMAGES_PER_BATCH) {
          const chunk = urls.slice(j, j + MAX_IMAGES_PER_BATCH);
          await sendChatwootImagesBatch(msgUrl, apiToken, chunk, "");
          if (j + MAX_IMAGES_PER_BATCH < urls.length && hasTimeBudget()) {
            await safeDelay(applyJitter(1000));
          }
        }
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
    }

    const isLast = i === consolidated.length - 1;
    if (!isLast && hasTimeBudget()) {
      const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
      await safeDelay(gapMs);
    }
  }
}

export { extractImagesFromMarkdown, sendChatwootTextMessage, sendChatwootImageMessage, sendChatwootMediaMessage, getHumanizationConfig, replyToChatwoot, applyJitter };
