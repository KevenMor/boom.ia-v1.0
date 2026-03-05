import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Media helpers ----------
async function sendChatwootMediaMessage(
  url: string,
  apiToken: string,
  mediaUrl: string,
  contentType: string = "video/mp4",
  caption?: string
): Promise<boolean> {
  try {
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) {
      console.error(`[Deliver] Media download failed ${mediaResp.status}: ${mediaUrl}`);
      return false;
    }

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

    if (!resp.ok) {
      console.error(`[Deliver] Media msg error ${resp.status}:`, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Deliver] Media msg error:`, e);
    return false;
  }
}

// ---------- Image helpers ----------
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

// ---------- Chatwoot message senders ----------
async function sendChatwootTextMessage(
  url: string,
  apiToken: string,
  content: string
): Promise<boolean> {
  try {
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
  } catch (e) {
    console.error(`[Deliver] Text msg fetch error:`, e);
    return false;
  }
}

async function sendChatwootImageMessage(
  url: string,
  apiToken: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  return sendChatwootImagesBatch(url, apiToken, [imageUrl], caption);
}

// Batch image sender: downloads all images in parallel, sends in a SINGLE POST with multiple attachments[]
async function sendChatwootImagesBatch(
  url: string,
  apiToken: string,
  imageUrls: string[],
  caption?: string
): Promise<boolean> {
  if (!imageUrls.length) return true;
  try {
    // Download all images in parallel
    const downloads = await Promise.allSettled(
      imageUrls.map(async (imageUrl) => {
        const parsedUrl = new URL(imageUrl);
        const imgResp = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": `${parsedUrl.protocol}//${parsedUrl.host}/`,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });
        if (!imgResp.ok) {
          console.error(`[Deliver] Image download failed ${imgResp.status}: ${imageUrl}`);
          return null;
        }
        const blob = await imgResp.blob();
        const filename = parsedUrl.pathname.split("/").pop() || "image.jpg";
        return { blob, filename };
      })
    );

    const successfulDownloads = downloads
      .filter((d): d is PromiseFulfilledResult<{ blob: Blob; filename: string } | null> => d.status === "fulfilled")
      .map(d => d.value)
      .filter((d): d is { blob: Blob; filename: string } => d !== null);

    if (successfulDownloads.length === 0) {
      console.error("[Deliver] All image downloads failed, sending URLs as text fallback");
      for (const u of imageUrls) await sendChatwootTextMessage(url, apiToken, u);
      return false;
    }

    // Build single FormData with ALL images
    const formData = new FormData();
    if (caption && caption.trim()) formData.append("content", caption.trim());
    formData.append("message_type", "outgoing");
    formData.append("private", "false");
    for (const { blob, filename } of successfulDownloads) {
      formData.append("attachments[]", blob, filename);
    }

    console.log(`[Deliver] Sending ${successfulDownloads.length} image(s) in single batch POST`);
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
  } catch (e) {
    console.error(`[Deliver] Batch image msg error:`, e);
    for (const u of imageUrls) {
      try { await sendChatwootTextMessage(url, apiToken, u); } catch { /* ignore */ }
    }
    return false;
  }
}

// ---------- Typing indicator ----------
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

// ---------- Humanization ----------
function applyJitter(ms: number): number {
  const jitter = 0.7 + Math.random() * 0.6;
  return Math.round(ms * jitter);
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

// ---------- Humanized Chatwoot reply ----------
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

  console.log(`[Deliver] Sending ${parts.length} message(s) to conv ${conversationId} | delays: read=${humanization.readDelayMs}ms typing=${humanization.typingDelayMs}ms gap=${humanization.blockGapMs}ms`);

  // No tight budget here — deliver-message has its own 30s
  const startTime = Date.now();
  const MAX_BUDGET_MS = 28000;
  const hasTimeBudget = () => (Date.now() - startTime) < MAX_BUDGET_MS;

  const safeDelay = async (ms: number) => {
    if (ms <= 0 || !hasTimeBudget()) return;
    const capped = Math.min(ms, MAX_BUDGET_MS - (Date.now() - startTime));
    if (capped <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, capped));
  };

  // 1) Read delay
  if (humanization.readDelayMs > 0 && hasTimeBudget()) {
    const readDelay = applyJitter(humanization.readDelayMs);
    console.log(`[Deliver] Read delay: ${readDelay}ms`);
    await safeDelay(readDelay);
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !part.trim()) continue;

    const { textOnly, imageUrls } = extractImagesFromMarkdown(part);

    // If this part has images, send them WITHOUT any text (no caption, no separate text message).
    // The next text-only part will naturally follow as its own message.
    if (imageUrls.length > 0) {
      // If there's meaningful text (not just a short intro), send it BEFORE images
      if (textOnly.trim() && textOnly.trim().length > 60) {
        if (humanization.typingDelayMs > 0 && hasTimeBudget()) {
          await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "on");
          const typingDelay = applyJitter(humanization.typingDelayMs);
          await safeDelay(typingDelay);
        }
        await sendChatwootTextMessage(msgUrl, apiToken, textOnly.trim());
        if (humanization.typingDelayMs > 0) {
          setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "off").catch(() => {});
        }
        // Small gap before images
        await safeDelay(applyJitter(1500));
      }
      // Send ALL images in a single batch POST (parallel download + single request)
      const ok = await sendChatwootImagesBatch(msgUrl, apiToken, imageUrls, "");
      console.log(`[Deliver] Part ${i + 1} batch ${imageUrls.length} image(s): ${ok ? "OK" : "FAIL"}`);
    } else if (textOnly.trim()) {
      // Pure text part
      // 2) Typing indicator + delay
      if (humanization.typingDelayMs > 0 && hasTimeBudget()) {
        await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "on");
        const typingDelay = applyJitter(humanization.typingDelayMs);
        console.log(`[Deliver] Typing delay (part ${i + 1}): ${typingDelay}ms`);
        await safeDelay(typingDelay);
      }

      const ok = await sendChatwootTextMessage(msgUrl, apiToken, textOnly.trim());
      console.log(`[Deliver] Part ${i + 1} text: ${ok ? "OK" : "FAIL"}`);
      if (humanization.typingDelayMs > 0) {
        setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "off").catch(() => {});
      }
    } else {
      // Fallback
      await sendChatwootTextMessage(msgUrl, apiToken, part.trim());
    }

    // 3) Inter-split delay — use configured block_gap_ms only (no hardcoded 2s base)
    const isLastPart = i === parts.length - 1;
    if (!isLastPart && hasTimeBudget()) {
      const gapMs = humanization.blockGapMs > 0 ? applyJitter(humanization.blockGapMs) : 2000;
      console.log(`[Deliver] Inter-split delay (after part ${i + 1}): ${gapMs}ms`);
      await safeDelay(gapMs);
    }
  }
}

// ---------- Main handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      agent_id,
      conversation_id,
      external_user_id,
      channel,
      chatwoot_conversation_id,
      response_text,
      response_parts,
      welcome_video_url,
    } = await req.json();

    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server config" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // ---------- Lookup agent config (with retry) ----------
    console.log("[Deliver] Looking up agent:", agent_id);
    let agent: any = null;
    let agentErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await supabase
        .from("agents")
        .select("id, name, tenant_id, config")
        .eq("id", agent_id)
        .maybeSingle();
      agent = res.data;
      agentErr = res.error;
      if (agent) break;
      console.warn(`[Deliver] Agent lookup attempt ${attempt}/3 failed:`, agentErr?.message || "not found");
      if (attempt < 3) await new Promise(r => setTimeout(r, 500));
    }

    if (agentErr || !agent) {
      console.error("[Deliver] Agent not found after 3 attempts:", agent_id, "error:", agentErr?.message);
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = (agent.config || {}) as Record<string, any>;
    const hasChatwootConfig = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
    console.log(`[Deliver] Payload welcome_video_url: ${welcome_video_url ? "YES" : "NO"}`);

    // ---------- Send to Chatwoot ----------
    if (chatwoot_conversation_id && hasChatwootConfig) {
      const baseUrl = cfg.chatwoot_url.replace(/\/+$/, "");
      const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/messages`;
      const humanization = getHumanizationConfig(cfg);

      if (welcome_video_url) {
        // ===== WELCOME FLOW: LLM greeting → video → "Como posso te chamar?" =====
        console.log(`[Deliver] Welcome flow active`);

        // 1) Send LLM-generated greeting using response_parts (split) when available
        const greetingParts: string[] = Array.isArray(response_parts) && response_parts.length > 0
          ? response_parts.filter((p: string) => p?.trim())
          : (response_text || "").trim() ? [(response_text || "").trim()] : [];

        if (greetingParts.length > 0) {
          console.log(`[Deliver] Sending LLM greeting in ${greetingParts.length} part(s)`);
          for (let i = 0; i < greetingParts.length; i++) {
            const part = greetingParts[i].trim();
            if (!part) continue;

            const { textOnly, imageUrls } = extractImagesFromMarkdown(part);

            // Send text
            if (textOnly.trim()) {
              const ok = await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, textOnly.trim());
              console.log(`[Deliver] Welcome part ${i + 1}/${greetingParts.length} text: ${ok ? "OK" : "FAIL"}`);
            }

            // Send images
            for (let j = 0; j < imageUrls.length; j++) {
              const ok = await sendChatwootImageMessage(msgUrl, cfg.chatwoot_api_token, imageUrls[j], "");
              console.log(`[Deliver] Welcome part ${i + 1} image ${j + 1}: ${ok ? "OK" : "FAIL"}`);
            }

            // Delay between parts (2s humanized)
            if (i < greetingParts.length - 1) {
              await new Promise((r) => setTimeout(r, applyJitter(2000)));
            }
          }
          // Final delay before video
          await new Promise((r) => setTimeout(r, 2000));
        }

        // 2) Send the video
        console.log(`[Deliver] Sending welcome video: ${welcome_video_url}`);
        const videoOk = await sendChatwootMediaMessage(msgUrl, cfg.chatwoot_api_token, welcome_video_url, "video/mp4", "");
        console.log(`[Deliver] Welcome video: ${videoOk ? "OK" : "FAIL"}`);
        // Wait 8s for Chatwoot to fully process and deliver video to WhatsApp
        await new Promise((r) => setTimeout(r, videoOk ? 8000 : 2000));

        // 3) Ask for the client's name
        const nameQuestion = cfg.welcome_name_question || "Como posso te chamar?";
        console.log(`[Deliver] Sending name question`);
        await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, nameQuestion);

        // 4) Save video + name question to conversation history (greeting already saved by chat-agent)
        if (conversation_id) {
          try {
            await supabase.rpc("save_message", {
              p_agent_id: agent_id,
              p_conversation_id: conversation_id,
              p_role: "assistant",
              p_content: "[Vídeo institucional enviado]",
              p_model: "system",
              p_latency_ms: null,
              p_metadata: { type: "welcome_video", video_url: welcome_video_url },
            });
            await supabase.rpc("save_message", {
              p_agent_id: agent_id,
              p_conversation_id: conversation_id,
              p_role: "assistant",
              p_content: nameQuestion,
              p_model: "system",
              p_latency_ms: null,
              p_metadata: { type: "welcome_name_question" },
            });
            console.log(`[Deliver] Welcome messages saved to conversation history`);
          } catch (e: any) {
            console.warn(`[Deliver] Failed to save welcome messages:`, e.message);
          }
        }
      } else {
        // ===== NORMAL FLOW =====
        console.log(`[Deliver] → Replying to Chatwoot conv ${chatwoot_conversation_id} (humanization: ${JSON.stringify(humanization)})`);
        await replyToChatwoot(
          cfg.chatwoot_url,
          cfg.chatwoot_api_token,
          cfg.chatwoot_account_id,
          chatwoot_conversation_id,
          (response_text || "").trim(),
          response_parts || [],
          humanization
        );
      }
    } else {
      console.log("[Deliver] No Chatwoot config or conversation ID, skipping delivery");
    }

    // ---------- Schedule follow-up ----------
    const followupEnabled = cfg.followup_enabled === true || cfg.followup_enabled === "true";

    console.log(`[Deliver] FollowUp check: enabled=${cfg.followup_enabled}(${typeof cfg.followup_enabled}) resolved=${followupEnabled}, convId=${conversation_id}, cwConvId=${chatwoot_conversation_id}`);

    if (followupEnabled && conversation_id && chatwoot_conversation_id) {
      const intervals: number[] = Array.isArray(cfg.followup_intervals) ? cfg.followup_intervals : [10, 20, 30];
      const maxAttempts = Number(cfg.followup_max_attempts) || intervals.length;
      const firstDelay = intervals[0] || 10;

      try {
        await supabase.rpc("schedule_followup", {
          p_agent_id: agent_id,
          p_conversation_id: conversation_id,
          p_external_user_id: external_user_id,
          p_channel: channel,
          p_chatwoot_conversation_id: chatwoot_conversation_id,
          p_attempt: 1,
          p_max_attempts: maxAttempts,
          p_intervals_minutes: JSON.stringify(intervals),
          p_delay_minutes: firstDelay,
        });
        console.log(`[Deliver] Scheduled follow-up in ${firstDelay}min for conv ${conversation_id}`);
      } catch (e: any) {
        console.warn("[Deliver] Schedule follow-up failed:", e.message);
      }
    }

    return new Response(
      JSON.stringify({ status: "delivered", conversation_id, parts: (response_parts || []).length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Deliver] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
