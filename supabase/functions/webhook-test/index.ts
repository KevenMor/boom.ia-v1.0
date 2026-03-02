import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      console.error(`[Chatwoot] Text msg error ${resp.status}:`, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Chatwoot] Text msg fetch error:`, e);
    return false;
  }
}

async function sendChatwootImageMessage(
  url: string,
  apiToken: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    // Download the image with browser-like headers to bypass hotlink protection
    const parsedUrl = new URL(imageUrl);
    const imgResp = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${parsedUrl.protocol}//${parsedUrl.host}/`,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!imgResp.ok) {
      console.error(`[Chatwoot] Image download failed ${imgResp.status}: ${imageUrl}`);
      // Fallback: send the URL as a clickable text link
      const fallbackOk = await sendChatwootTextMessage(url, apiToken, imageUrl);
      console.log(`[Chatwoot] Image fallback link: ${fallbackOk ? "OK" : "FAIL"}`);
      return fallbackOk;
    }

    const imgBlob = await imgResp.blob();
    // Extract filename from URL
    const urlPath = parsedUrl.pathname;
    const filename = urlPath.split("/").pop() || "image.jpg";

    // Build multipart form-data
    const formData = new FormData();
    formData.append("content", caption || "");
    formData.append("message_type", "outgoing");
    formData.append("private", "false");
    formData.append("attachments[]", imgBlob, filename);

    const resp = await fetch(url, {
      method: "POST",
      headers: { api_access_token: apiToken },
      body: formData,
    });

    if (!resp.ok) {
      console.error(`[Chatwoot] Image msg error ${resp.status}:`, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Chatwoot] Image msg error:`, e);
    // Fallback: send URL as text
    try {
      await sendChatwootTextMessage(url, apiToken, imageUrl);
    } catch (e2) { /* ignore fallback error */ }
    return false;
  }
}

// ---------- Chatwoot typing indicator ----------
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
    if (!resp.ok) {
      console.warn(`[Chatwoot] Typing ${status} failed ${resp.status}`);
    }
  } catch (e) {
    console.warn(`[Chatwoot] Typing ${status} error:`, e);
  }
}

// ---------- Humanization helpers ----------
function applyJitter(ms: number): number {
  // ±30% random jitter
  const jitter = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
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

// ---------- Chatwoot reply (with humanized delays + typing indicator) ----------
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

  console.log(`[Chatwoot] Sending ${parts.length} message(s) to conv ${conversationId} | delays: read=${humanization.readDelayMs}ms typing=${humanization.typingDelayMs}ms gap=${humanization.blockGapMs}ms`);

  // Time budget: Edge Functions have a 30s limit. Reserve time for message delivery.
  const startTime = Date.now();
  const MAX_DELAY_BUDGET_MS = 22000; // 22s max for delays, leave 8s for actual API calls

  const hasTimeBudget = () => (Date.now() - startTime) < MAX_DELAY_BUDGET_MS;

  const safeDelay = async (ms: number) => {
    if (ms <= 0 || !hasTimeBudget()) return;
    const capped = Math.min(ms, MAX_DELAY_BUDGET_MS - (Date.now() - startTime));
    if (capped <= 0) return;
    await new Promise(resolve => setTimeout(resolve, capped));
  };

  // 1) Initial "read" delay — agent reads the message before typing
  if (humanization.readDelayMs > 0 && hasTimeBudget()) {
    const readDelay = applyJitter(humanization.readDelayMs);
    console.log(`[Humanize] Read delay: ${readDelay}ms`);
    await safeDelay(readDelay);
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !part.trim()) continue;

    const { textOnly, imageUrls } = extractImagesFromMarkdown(part);

    // 2) Show "typing..." indicator before each text block
    if (textOnly.trim() && humanization.typingDelayMs > 0 && hasTimeBudget()) {
      await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "on");
      const typingDelay = applyJitter(humanization.typingDelayMs);
      console.log(`[Humanize] Typing delay (part ${i + 1}): ${typingDelay}ms`);
      await safeDelay(typingDelay);
    }

    // Send text portion (if any)
    if (textOnly.trim()) {
      const ok = await sendChatwootTextMessage(msgUrl, apiToken, textOnly.trim());
      console.log(`[Chatwoot] Part ${i + 1} text: ${ok ? "OK" : "FAIL"}`);
      // Turn off typing after sending
      if (humanization.typingDelayMs > 0) {
        await setChatwootTyping(chatwootUrl, apiToken, accountId, conversationId, "off");
      }
    }

    // Send each image as attachment
    for (let j = 0; j < imageUrls.length; j++) {
      const caption = j === 0 && !textOnly.trim() ? "" : "";
      const ok = await sendChatwootImageMessage(msgUrl, apiToken, imageUrls[j], caption);
      console.log(`[Chatwoot] Part ${i + 1} image ${j + 1}/${imageUrls.length}: ${ok ? "OK" : "FAIL"}`);
    }

    // After sending images, short delay for WhatsApp to deliver them before next text
    if (imageUrls.length > 0) {
      const nextPartIndex = i + 1;
      const hasMoreAfter = nextPartIndex < parts.length && parts.slice(nextPartIndex).some(p => p?.trim());
      if (hasMoreAfter && hasTimeBudget()) {
        const photoDelay = Math.min(5000, Math.max(2000, imageUrls.length * 1500));
        console.log(`[Chatwoot] Waiting ${photoDelay}ms after ${imageUrls.length} photo(s) before next part`);
        await safeDelay(photoDelay);
      }
    }

    // If no text and no images, send as-is
    if (!textOnly.trim() && imageUrls.length === 0) {
      await sendChatwootTextMessage(msgUrl, apiToken, part.trim());
    }

    // 3) Block gap delay between parts (not after the last one)
    const isLastPart = i === parts.length - 1;
    if (!isLastPart && humanization.blockGapMs > 0 && hasTimeBudget()) {
      const gapDelay = applyJitter(humanization.blockGapMs);
      console.log(`[Humanize] Block gap (after part ${i + 1}): ${gapDelay}ms`);
      await safeDelay(gapDelay);
    }
  }
}

// ---------- Chatwoot payload parser ----------
interface ChatwootAttachment {
  id: number;
  file_type: string; // "audio" | "image" | "file" | "video"
  data_url: string;
  file_size?: number;
  account_id?: number;
  extension?: string | null;
}

function parseChatwootPayload(body: Record<string, unknown>) {
  if (body.event === "message_created" && body.message_type === "incoming") {
    const sender = (body.sender || {}) as Record<string, unknown>;
    const conversation = (body.conversation || {}) as Record<string, unknown>;
    const contactMeta = (conversation.contact || sender || {}) as Record<string, unknown>;
    const conversationMeta = (conversation.meta || {}) as Record<string, unknown>;
    const metaSender = (conversationMeta.sender || {}) as Record<string, unknown>;

    // Extract phone number - try all known locations
    const phoneCandidates = [
      sender.phone_number as string,
      contactMeta.phone_number as string,
      metaSender.phone_number as string,
      conversation.source_id as string,
      contactMeta.identifier as string,
    ].filter(Boolean);

    // Pick the first value that looks like a phone (has 10+ digits)
    const isPhoneLike = (v: string) => (v || "").replace(/\D/g, "").length >= 10;
    const phoneNumber = phoneCandidates.find(isPhoneLike) || null;

    const eventMessageId =
      (body.id as string | number | undefined) ??
      ((body as any).message?.id as string | number | undefined) ??
      ((body as any).messages?.[0]?.id as string | number | undefined) ??
      null;

    // ALWAYS use the phone number as externalUserId for WhatsApp
    const externalUserId = phoneNumber || String(sender.id ?? "chatwoot-user");

    // Extract attachments (audio, images, files, videos)
    const rawAttachments = (body.attachments || []) as ChatwootAttachment[];
    const attachments: ChatwootAttachment[] = rawAttachments
      .filter((a) => a.data_url && a.file_type)
      .map((a) => ({
        id: a.id,
        file_type: a.file_type,
        data_url: a.data_url,
        file_size: a.file_size,
        extension: a.extension ?? null,
      }));

    return {
      isChatwoot: true,
      message: (body.content as string) || "",
      eventMessageId: eventMessageId ? String(eventMessageId) : null,
      externalUserId,
      contactName: (sender.name as string) || null,
      contactAvatarUrl: (sender.thumbnail as string) || (sender.avatar_url as string) || null,
      chatwootConversationId: (conversation.id as number) ?? null,
      chatwootContactId: Number(contactMeta.id ?? sender.id ?? 0) || null,
      channel: (conversation.channel as string) || "chatwoot",
      attachments,
    };
  }
  return { isChatwoot: false, message: "", eventMessageId: null as string | null, externalUserId: "", contactName: null as string | null, contactAvatarUrl: null as string | null, chatwootConversationId: null, chatwootContactId: null as number | null, channel: "", attachments: [] as ChatwootAttachment[] };
}

// ---------- Webhook idempotency (anti-duplicate retries) ----------
const WEBHOOK_EVENT_TTL_MS = 10 * 60 * 1000;
const runtimeProcessedEvents: Map<string, number> = (globalThis as any).__runtimeProcessedEvents || new Map<string, number>();
(globalThis as any).__runtimeProcessedEvents = runtimeProcessedEvents;

function markOrCheckProcessedEvent(eventKey: string): boolean {
  const now = Date.now();

  // cleanup old keys
  for (const [k, ts] of runtimeProcessedEvents.entries()) {
    if (now - ts > WEBHOOK_EVENT_TTL_MS) runtimeProcessedEvents.delete(k);
  }

  if (runtimeProcessedEvents.has(eventKey)) return true;
  runtimeProcessedEvents.set(eventKey, now);
  return false;
}

function normalizeContent(value: string): string {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function hasRecentDuplicateIncoming(
  supabase: any,
  agentId: string,
  convId: string,
  incomingText: string,
  windowSeconds = 45
): Promise<boolean> {
  try {
    const { data: history } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: agentId,
      p_conversation_id: convId,
    });

    if (!history || !Array.isArray(history) || history.length === 0) return false;

    const now = Date.now();
    const normalizedIncoming = normalizeContent(incomingText);
    if (!normalizedIncoming) return false;

    const recent = history.slice(-20).some((m: any) => {
      if (m.role !== "user") return false;
      const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (!createdAt || now - createdAt > windowSeconds * 1000) return false;
      return normalizeContent(String(m.content || "")) === normalizedIncoming;
    });

    return recent;
  } catch (e) {
    console.warn("[Webhook] Could not verify duplicate incoming message:", e);
    return false;
  }
}

// ---------- Debounce: buffer message and check if we're the last ----------
async function bufferMessage(
  supabase: any,
  agentId: string,
  externalUserId: string,
  channel: string,
  content: string,
  chatwootConversationId: number | null
) {
  const { data, error } = await supabase
    .from("webhook_message_buffer")
    .insert({
      agent_id: agentId,
      external_user_id: externalUserId,
      channel,
      content,
      chatwoot_conversation_id: chatwootConversationId,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[Debounce] Buffer insert failed:", error.message);
    return null;
  }
  return data as { id: string; created_at: string };
}

async function isLastMessage(
  supabase: any,
  agentId: string,
  externalUserId: string,
  channel: string,
  myCreatedAt: string
): Promise<boolean> {
  const { data } = await supabase
    .from("webhook_message_buffer")
    .select("id")
    .eq("agent_id", agentId)
    .eq("external_user_id", externalUserId)
    .eq("channel", channel)
    .eq("processed", false)
    .gt("created_at", myCreatedAt)
    .limit(1);

  return !data || data.length === 0;
}

async function consumeBufferedMessages(
  supabase: any,
  agentId: string,
  externalUserId: string,
  channel: string
): Promise<string[]> {
  // Fetch all pending messages in order
  const { data: pending } = await supabase
    .from("webhook_message_buffer")
    .select("id, content, created_at")
    .eq("agent_id", agentId)
    .eq("external_user_id", externalUserId)
    .eq("channel", channel)
    .eq("processed", false)
    .order("created_at", { ascending: true });

  if (!pending || pending.length === 0) return [];

  // Delete consumed messages immediately (no need to keep them)
  const ids = pending.map((m: any) => m.id);
  await supabase
    .from("webhook_message_buffer")
    .delete()
    .in("id", ids);

  return pending.map((m: any) => m.content as string);
}

// ---------- Process agent response via chat-agent ----------
async function callChatAgent(
  cloudUrl: string,
  cloudKey: string,
  nexusKey: string,
  agentId: string,
  messages: { role: string; content: string }[],
  convId: string | null
) {
  const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;
  const chatResp = await fetch(chatAgentUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cloudKey}`,
      "x-nexus-auth": `Bearer ${nexusKey}`,
    },
    body: JSON.stringify({ agent_id: agentId, messages, conversation_id: convId }),
  });

  if (!chatResp.ok) {
    const errText = await chatResp.text();
    console.error("chat-agent error:", chatResp.status, errText);
    return { error: errText, fullContent: "", responseParts: [], responseConvId: convId };
  }

  const reader = chatResp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullContent = "";
  let responseConvId = convId;
  const MSG_SPLIT = "<<MSG_SPLIT>>";
  const responseParts: string[] = [];
  let currentPart = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6);
      if (json === "[DONE]") continue;
      try {
        const ev = JSON.parse(json);
        if (ev.conversation_id) { responseConvId = ev.conversation_id; continue; }
        if (ev.debug || ev.edge_logs) continue;
        const delta = ev.choices?.[0]?.delta?.content;
        if (delta) {
          if (delta === MSG_SPLIT) {
            if (currentPart.trim()) responseParts.push(currentPart.trim());
            currentPart = "";
          } else {
            currentPart += delta;
            fullContent += delta;
          }
        }
      } catch { /* skip */ }
    }
  }

  if (currentPart.trim()) responseParts.push(currentPart.trim());

  return { error: null, fullContent, responseParts, responseConvId };
}

// ---------- Main handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");
    const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
    const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // ---- Early filter: only process message_created events from Chatwoot ----
    // Chatwoot sends conversation_created, conversation_updated, message_created, etc.
    // We only care about message_created with incoming messages.
    if (body.event && body.event !== "message_created") {
      console.log(`[Webhook] Ignoring Chatwoot event: ${body.event}`);
      return new Response(
        JSON.stringify({ status: "ignored", reason: `Event '${body.event}' not handled` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also ignore outgoing messages (sent by the bot itself or agents)
    if (body.event === "message_created" && body.message_type !== "incoming") {
      console.log(`[Webhook] Ignoring non-incoming message_type: ${body.message_type}`);
      return new Response(
        JSON.stringify({ status: "ignored", reason: "Not an incoming message" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DEBUG: log raw Chatwoot payload for phone extraction analysis
    if (body.event === "message_created") {
      const sender = (body.sender || {}) as Record<string, unknown>;
      const conversation = (body.conversation || {}) as Record<string, unknown>;
      const contactInConv = (conversation.contact || {}) as Record<string, unknown>;
      const meta = (conversation.meta || {}) as Record<string, unknown>;
      const metaSender = (meta.sender || {}) as Record<string, unknown>;
      console.log("[DEBUG] Chatwoot sender:", JSON.stringify({
        phone_number: sender.phone_number,
        email: sender.email,
        name: sender.name,
        id: sender.id,
      }));
      console.log("[DEBUG] Chatwoot conversation.contact:", JSON.stringify({
        phone_number: contactInConv.phone_number,
        identifier: contactInConv.identifier,
        id: contactInConv.id,
      }));
      console.log("[DEBUG] Chatwoot conversation.meta.sender:", JSON.stringify({
        phone_number: metaSender.phone_number,
        id: metaSender.id,
      }));
      console.log("[DEBUG] Chatwoot conversation.source_id:", conversation.source_id);
      console.log("[DEBUG] Chatwoot conversation.channel:", conversation.channel);
    }

    const url = new URL(req.url);
    const agentId = url.searchParams.get("agent_id") || (body.agent_id as string) || null;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing 'agent_id'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // ---- Lookup agent ----
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, status, tenant_id, config")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr || !agent) {
      console.error("[Webhook] Agent not found:", agentId);
      return new Response(JSON.stringify({ error: "Invalid agent_id" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (agent.status !== "active") {
      return new Response(JSON.stringify({ error: "Agent is not active" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = (agent.config || {}) as Record<string, any>;

    // ---- Parse input ----
    const chatwoot = parseChatwootPayload(body);

    let userMessage: string;
    let externalUserId: string;
    let channel: string;
    let chatwootConversationId: number | null = null;
    let chatwootContactId: number | null = null;
    let contactName: string | null = null;
    let contactAvatarUrl: string | null = null;

    if (chatwoot.isChatwoot) {
      userMessage = chatwoot.message;
      externalUserId = chatwoot.externalUserId;
      channel = chatwoot.channel;
      chatwootConversationId = chatwoot.chatwootConversationId;
      chatwootContactId = chatwoot.chatwootContactId;
      contactName = chatwoot.contactName;
      contactAvatarUrl = chatwoot.contactAvatarUrl;
    } else {
      userMessage = (body.message || body.text || body.content || "") as string;
      externalUserId = (body.external_user_id || body.from || body.sender || body.phone || "anonymous") as string;
      channel = (body.channel || "webhook") as string;
    }

    // ---- Fast idempotency by Chatwoot event message id ----
    if (chatwoot.isChatwoot && chatwoot.eventMessageId) {
      const eventKey = `${agentId}:${chatwoot.eventMessageId}`;
      if (markOrCheckProcessedEvent(eventKey)) {
        console.log(`[Webhook] Duplicate event ignored by idempotency key: ${eventKey}`);
        return new Response(
          JSON.stringify({ status: "ignored_duplicate", reason: "Duplicate webhook event (same message id)" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Allow empty text if attachments exist (e.g., audio-only messages)
    if (!userMessage && (!chatwoot.isChatwoot || chatwoot.attachments.length === 0)) {
      return new Response(
        JSON.stringify({ error: "No message content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log attachments if present
    if (chatwoot.attachments.length > 0) {
      console.log(`[Webhook] ${chatwoot.attachments.length} attachment(s): ${chatwoot.attachments.map(a => `${a.file_type}(${a.data_url?.slice(0, 60)}...)`).join(", ")}`);
    }

    // ---- Cancel pending follow-ups (client replied) ----
    // We cancel early, before debounce, so follow-ups don't fire while we wait
    let earlyConvId: string | null = null;
    try {
      const { data: existingConvId } = await supabase.rpc("find_or_create_webhook_conversation", {
        p_agent_id: agentId,
        p_channel: channel,
        p_external_user_id: externalUserId,
        p_chatwoot_conversation_id: chatwootConversationId,
        p_chatwoot_contact_id: chatwootContactId,
        p_contact_name: contactName,
        p_contact_avatar_url: contactAvatarUrl,
      });
      earlyConvId = existingConvId;
      if (earlyConvId) {
        const { data: cancelledCount } = await supabase.rpc("cancel_pending_followups", {
          p_agent_id: agentId,
          p_conversation_id: earlyConvId,
        });
        if (cancelledCount && cancelledCount > 0) {
          console.log(`[FollowUp] Cancelled ${cancelledCount} pending follow-up(s) for conv ${earlyConvId}`);
        }
      }
    } catch (e) {
      console.warn("[FollowUp] Early cancel failed (non-critical):", e);
    }

    // ---- Extra idempotency guard (covers retries across cold starts) ----
    if (earlyConvId) {
      const duplicated = await hasRecentDuplicateIncoming(
        supabase,
        agentId,
        earlyConvId,
        userMessage,
        45
      );
      if (duplicated) {
        console.log(`[Webhook] Duplicate incoming ignored by recent-history guard (conv=${earlyConvId})`);
        return new Response(
          JSON.stringify({ status: "ignored_duplicate", reason: "Recent identical incoming already processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ---- ASYNC PATH: Chatwoot messages go through queue ----
    if (chatwoot.isChatwoot) {
      const debounceMs = Number(cfg.message_debounce_ms) || 0;
      let bufferCreatedAt: string | null = null;

      if (debounceMs > 0) {
        console.log(`[Webhook] Buffering message, debounce: ${debounceMs}ms`);
        const buffered = await bufferMessage(
          supabase, agentId, externalUserId, channel, userMessage, chatwootConversationId
        );
        bufferCreatedAt = buffered?.created_at || null;
      }

      // Fire process-queue (fire-and-forget with short timeout)
      const processQueueUrl = `${cloudUrl}/functions/v1/process-queue`;
      const payload = {
        agent_id: agentId,
        conversation_id: earlyConvId,
        external_user_id: externalUserId,
        channel,
        chatwoot_conversation_id: chatwootConversationId,
        chatwoot_contact_id: chatwootContactId,
        contact_name: contactName,
        contact_avatar_url: contactAvatarUrl,
        user_message: debounceMs > 0 ? null : userMessage,
        debounce_ms: debounceMs,
        buffer_created_at: bufferCreatedAt,
        attachments: chatwoot.attachments,
      };

      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(processQueueUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cloudKey}` },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        console.log(`[Webhook] Fired process-queue: ${resp.status}`);
        await resp.text().catch(() => {});
      } catch (e: any) {
        if (e.name === "AbortError") {
          console.log("[Webhook] Fired process-queue (still processing)");
        } else {
          console.error("[Webhook] Fire process-queue error:", e.message);
        }
      }

      return new Response(
        JSON.stringify({ status: "queued", agent_id: agentId, conversation_id: earlyConvId }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- SYNC PATH: Non-Chatwoot webhooks (API calls, sandbox fallback) ----
    const debounceMs = Number(cfg.message_debounce_ms) || 0;

    if (debounceMs > 0) {
      console.log(`[Debounce] Buffering message, window: ${debounceMs}ms`);
      const buffered = await bufferMessage(supabase, agentId, externalUserId, channel, userMessage, chatwootConversationId);
      if (buffered) {
        await new Promise((r) => setTimeout(r, debounceMs));
        const imLast = await isLastMessage(supabase, agentId, externalUserId, channel, buffered.created_at);
        if (!imLast) {
          return new Response(JSON.stringify({ status: "buffered" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const allMessages = await consumeBufferedMessages(supabase, agentId, externalUserId, channel);
        if (allMessages.length > 0) userMessage = allMessages.join("\n");
      }
    }

    const conversationId = (body.conversation_id || null) as string | null;
    let convId = conversationId || earlyConvId;

    if (!convId) {
      try {
        const { data } = await supabase.rpc("create_conversation", {
          p_agent_id: agentId, p_channel: channel, p_external_user_id: externalUserId,
          p_contact_name: contactName, p_contact_avatar_url: contactAvatarUrl,
        });
        convId = data;
      } catch (e) { console.error("Could not create conversation:", e); }
    }

    let conversationMessages: { role: string; content: string }[] = [];
    if (convId) {
      try {
        const { data: history } = await supabase.rpc("load_conversation_messages", { p_agent_id: agentId, p_conversation_id: convId });
        if (history && Array.isArray(history)) {
          conversationMessages = history.slice(-20).map((m: Record<string, unknown>) => ({
            role: m.role === "tool" ? "system" : (m.role as string), content: (m.content as string) || "",
          }));
        }
      } catch (e) { console.warn("Could not load history:", e); }
    }

    let cleanedUserMessage = userMessage.replace(/^\*{1,2}[^*\n]+:\*{1,2}\s*\n?/gm, "").trim();
    const messages = [...conversationMessages, { role: "user", content: cleanedUserMessage }];
    const result = await callChatAgent(cloudUrl, cloudKey, nexusKey, agentId, messages, convId);

    if (result.error) {
      return new Response(JSON.stringify({ error: "Agent processing failed", detail: result.error }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        agent_id: agentId, agent_name: agent.name, conversation_id: result.responseConvId,
        external_user_id: externalUserId, channel, response: result.fullContent.trim(),
        message_parts: result.responseParts.length > 0 ? result.responseParts : [result.fullContent.trim()],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
