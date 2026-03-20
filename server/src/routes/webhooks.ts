import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix } from "../utils/sanitize.js";
import { msgLog } from "../utils/flow-logger.js";
import { upsertCrmContact } from "../services/crm-contact-sync.js";
import { getChatwootAuthHeaders } from "../services/delivery.js";

const API_BASE = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

/**
 * Busca attachments de uma mensagem via API do Chatwoot.
 * O webhook às vezes não inclui attachments em mensagens incoming (issue #8999).
 * Usa GET /messages com after/before para obter a mensagem completa.
 * Inclui retry com delay (race: webhook pode chegar antes da mensagem estar na API).
 * Tenta conversation.id e conversation.display_id (API pode usar um ou outro).
 */
async function fetchChatwootMessageAttachments(
  cfg: Record<string, unknown>,
  conversationId: number,
  messageId: string,
  agentId?: string,
  conversationDisplayId?: number | null
): Promise<ChatwootAttachment[]> {
  const baseUrl = (cfg.chatwoot_url as string)?.replace(/\/+$/, "");
  const accountId = cfg.chatwoot_account_id;
  const apiToken = cfg.chatwoot_api_token as string;
  if (!baseUrl || !accountId || !apiToken) return [];

  const msgIdNum = parseInt(messageId, 10);
  if (isNaN(msgIdNum)) return [];

  const c1 = Number(conversationId);
  const c2 = conversationDisplayId != null ? Number(conversationDisplayId) : NaN;
  const uniqueConvIds = [...new Set([c1, c2].filter((id) => !isNaN(id) && id > 0))];
  if (uniqueConvIds.length === 0) return [];

  const auth = getChatwootAuthHeaders(apiToken, cfg);

  const tryFetch = async (convId: number, param: string, value: number): Promise<ChatwootAttachment[]> => {
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages?${param}=${value}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...auth },
    });
    if (!resp.ok) {
      if (agentId) {
        console.warn(`[Webhook] Chatwoot API conv=${convId} ${param}=${value}:`, resp.status, (await resp.text().catch(() => "")).slice(0, 120));
      }
      return [];
    }
    const data = (await resp.json()) as { payload?: Array<Record<string, unknown>> };
    const payload = data.payload ?? [];
    const msg = payload.find((m) => String(m.id) === messageId);
    if (!msg && agentId && payload.length > 0) {
      const ids = payload.map((m) => m.id).slice(0, 5);
      console.warn(`[Webhook] Message ${messageId} not in API response. Payload has ${payload.length} msgs, sample ids: ${ids.join(",")}`);
    }
    if (!msg) return [];
    return extractAttachmentsFromMessage(msg, messageId, agentId);
  };

  const tryFetchConversation = async (convId: number): Promise<ChatwootAttachment[]> => {
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...auth },
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as Record<string, unknown>;
    const conv = (data.payload ?? data) as Record<string, unknown>;
    const messages = ((conv.messages ?? data.messages ?? data.payload ?? []) as Array<Record<string, unknown>>);
    const msg = messages.find((m) => String(m.id) === messageId);
    if (!msg) return [];
    return extractAttachmentsFromMessage(msg, messageId, agentId);
  };

  const extractAttachmentsFromMessage = (
    msg: Record<string, unknown>,
    messageId: string,
    agentId?: string
  ): ChatwootAttachment[] => {
    let raw = ((msg.attachments || []) as any[]).concat(
      msg.attachment ? [msg.attachment] : []
    );
    const contentAttrs = (msg.content_attributes || {}) as Record<string, unknown>;
    if (raw.length === 0 && contentAttrs) {
      const extUrl =
        (contentAttrs.external_url as string) ||
        (contentAttrs as any).media?.url ||
        (contentAttrs as any).media_url ||
        (contentAttrs as any).story_url ||
        (contentAttrs as any).data?.url ||
        (Array.isArray((contentAttrs as any).attachments) && (contentAttrs as any).attachments[0]?.url);
      if (extUrl && typeof extUrl === "string") {
        raw = [{ data_url: extUrl, file_type: "image", url: extUrl, external_url: extUrl }];
      }
    }
    if (raw.length === 0 && agentId) {
      const msgPreview = JSON.stringify({
        keys: Object.keys(msg),
        content_type: msg.content_type,
        content_attributes: msg.content_attributes,
      }).slice(0, 500);
      console.warn(`[Webhook] Message ${messageId} found but no attachments. ${msgPreview}`);
    }
    const urlKeys = ["data_url", "url", "file_url", "external_url"];
    const getUrl = (a: any) => urlKeys.map((k) => a?.[k]).find(Boolean);
    const fileTypeMap: Record<number, string> = { 0: "image", 1: "audio", 2: "video", 3: "file" };
    const getFileType = (a: any) => {
      const v = a?.file_type ?? a?.content_type;
      if (typeof v === "string") return v;
      return (fileTypeMap[v] ?? "file") as string;
    };
    return raw
      .filter((a) => getUrl(a) && (a?.file_type != null || a?.content_type != null))
      .map((a) => ({
        id: a.id ?? 0,
        file_type: getFileType(a),
        data_url: getUrl(a) as string,
        file_size: a.file_size,
        extension: a.extension ?? null,
      }));
  };

  for (const convId of uniqueConvIds) {
    const convAttachments = await tryFetchConversation(convId);
    if (convAttachments.length > 0) {
      if (agentId) {
        console.log(`[Webhook] agent=${agentId.slice(0, 8)}… | fetched ${convAttachments.length} attachment(s) via Chatwoot API (conversation details)`);
      }
      return convAttachments;
    }
  }

  const attempts: [number, string, number][] = [
    [0, "after", Math.max(0, msgIdNum - 1)],
    [500, "after", Math.max(0, msgIdNum - 1)],
    [0, "before", msgIdNum + 1],
  ];
  for (const convId of uniqueConvIds) {
    for (const [delayMs, param, value] of attempts) {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const attachments = await tryFetch(convId, param, value);
      if (attachments.length > 0) {
        if (agentId) {
          console.log(`[Webhook] agent=${agentId.slice(0, 8)}… | fetched ${attachments.length} attachment(s) via Chatwoot API (conv=${convId} ${param}=${value})`);
        }
        return attachments;
      }
    }
  }
  if (agentId) {
    console.warn(`[Webhook] No attachments found via API | convIds=[${uniqueConvIds.join(",")}] msgId=${messageId}`);
  }
  return [];
}

interface ChatwootAttachment {
  id: number;
  file_type: string;
  data_url: string;
  file_size?: number;
  extension?: string | null;
}

function parseChatwootPayload(body: Record<string, unknown>) {
  const mt = body.message_type;
  const mtStr = typeof mt === "string" ? (mt as string).toLowerCase() : "";
  const isIncoming =
    mt === "incoming" ||
    mtStr === "incoming" ||
    (typeof mt === "number" && mt === 0);
  if (body.event === "message_created" && isIncoming) {
    const sender = (body.sender || {}) as Record<string, unknown>;
    const conversation = (body.conversation || {}) as Record<string, unknown>;
    const rootContact = (body.contact || {}) as Record<string, unknown>;
    const contactMeta = (rootContact && Object.keys(rootContact).length > 0
      ? rootContact
      : (conversation.contact || sender)) as Record<string, unknown>;
    const conversationMeta = (conversation.meta || {}) as Record<string, unknown>;
    const metaSender = (conversationMeta.sender || {}) as Record<string, unknown>;

    const phoneCandidates = [
      sender.phone_number as string,
      contactMeta.phone_number as string,
      metaSender.phone_number as string,
      conversation.source_id as string,
      (body as any).source_id as string,
      contactMeta.identifier as string,
    ].filter(Boolean);

    const isPhoneLike = (v: string) => (v || "").replace(/\D/g, "").length >= 10;
    const phoneNumber = phoneCandidates.find(isPhoneLike) || null;

    const eventMessageId =
      (body.id as string | number | undefined) ??
      ((body as any).message?.id as string | number | undefined) ??
      ((body as any).messages?.[0]?.id as string | number | undefined) ??
      null;

    const externalUserId = phoneNumber || String(contactMeta.id ?? sender.id ?? "chatwoot-user");

    const rawAttachments = ((body.attachments || []) as ChatwootAttachment[]).concat(
      ((body as any).message?.attachments || []) as ChatwootAttachment[],
      ((body as any).conversation?.messages?.[0]?.attachments || []) as ChatwootAttachment[]
    );
    const attachments: ChatwootAttachment[] = rawAttachments
      .filter((a) => (a.data_url || (a as any).url || (a as any).file_url) && (a.file_type || (a as any).content_type))
      .map((a) => ({
        id: a.id,
        file_type: a.file_type || (a as any).content_type || "file",
        data_url: a.data_url || (a as any).url || (a as any).file_url,
        file_size: a.file_size,
        extension: a.extension ?? null,
      }));

    const assignee = (conversationMeta.assignee || conversation.assignee || null) as Record<string, unknown> | null;
    const assigneeId = assignee ? Number(assignee.id ?? 0) : null;
    const assigneeName = assignee ? (assignee.name as string) || null : null;

    const content =
      (body.content as string) ||
      ((body as any).message?.content as string) ||
      ((body as any).message?.body as string) ||
      ((body as any).message?.text as string) ||
      ((body as any).content_attributes?.text as string) ||
      "";

    const convId = (conversation.id as number) ?? (conversation.display_id as number) ?? null;
    const convDisplayId = (conversation.display_id as number) ?? (conversation.id as number) ?? null;

    return {
      isChatwoot: true,
      message: content,
      eventMessageId: eventMessageId ? String(eventMessageId) : null,
      externalUserId,
      contactName: (contactMeta.name as string) || (sender.name as string) || null,
      contactAvatarUrl: (contactMeta.thumbnail as string) || (contactMeta.avatar_url as string) || (sender.thumbnail as string) || (sender.avatar_url as string) || null,
      chatwootConversationId: convId,
      chatwootConversationDisplayId: convDisplayId,
      chatwootContactId: Number(contactMeta.id ?? sender.id ?? 0) || null,
      channel: (conversation.channel as string) || "chatwoot",
      attachments,
      assigneeId,
      assigneeName,
    };
  }
  return {
    isChatwoot: false,
    message: "",
    eventMessageId: null as string | null,
    externalUserId: "",
    contactName: null as string | null,
    contactAvatarUrl: null as string | null,
    chatwootConversationId: null,
    chatwootConversationDisplayId: null as number | null,
    chatwootContactId: null as number | null,
    channel: "",
    attachments: [] as ChatwootAttachment[],
    assigneeId: null as number | null,
    assigneeName: null as string | null,
  };
}

/** Parser para mensagens outgoing do Chatwoot. O contact é o cliente (destinatário), sender é o agente. */
function parseChatwootPayloadOutgoing(body: Record<string, unknown>) {
  const mt = body.message_type;
  const mtStr = typeof mt === "string" ? (mt as string).toLowerCase() : "";
  const isOutgoing =
    mt === "outgoing" ||
    mt === 1 ||
    mt === "1" ||
    (typeof mt === "string" && mt.toLowerCase() === "outgoing");
  if (body.event === "message_created" && isOutgoing) {
    const conversation = (body.conversation || {}) as Record<string, unknown>;
    const rootContact = (body.contact || {}) as Record<string, unknown>;
    const contactMeta = (rootContact && Object.keys(rootContact).length > 0
      ? rootContact
      : (conversation.contact || {})) as Record<string, unknown>;
    const conversationMeta = (conversation.meta || {}) as Record<string, unknown>;
    const metaSender = (conversationMeta.sender || {}) as Record<string, unknown>;
    const sender = (body.sender || {}) as Record<string, unknown>;

    const phoneCandidates = [
      contactMeta.phone_number as string,
      metaSender.phone_number as string,
      conversation.source_id as string,
      (body as any).source_id as string,
      contactMeta.identifier as string,
    ].filter(Boolean);

    const isPhoneLike = (v: string) => (v || "").replace(/\D/g, "").length >= 10;
    const phoneNumber = phoneCandidates.find(isPhoneLike) || null;

    const eventMessageId =
      (body.id as string | number | undefined) ??
      ((body as any).message?.id as string | number | undefined) ??
      ((body as any).messages?.[0]?.id as string | number | undefined) ??
      null;

    const externalUserId = phoneNumber || String(contactMeta.id ?? "chatwoot-user");

    const assignee = (conversationMeta.assignee || conversation.assignee || null) as Record<string, unknown> | null;
    const assigneeId = assignee ? Number(assignee.id ?? 0) : null;
    const assigneeName = assignee ? (assignee.name as string) || null : null;

    const content =
      (body.content as string) ||
      ((body as any).message?.content as string) ||
      ((body as any).message?.body as string) ||
      ((body as any).message?.text as string) ||
      ((body as any).content_attributes?.text as string) ||
      "";

    const convId = (conversation.id as number) ?? (conversation.display_id as number) ?? null;

    const rawAttachments = ((body.attachments || []) as ChatwootAttachment[]).concat(
      ((body as any).message?.attachments || []) as ChatwootAttachment[]
    );
    const attachments: ChatwootAttachment[] = rawAttachments
      .filter((a) => (a.data_url || (a as any).url || (a as any).file_url) && (a.file_type || (a as any).content_type))
      .map((a) => ({
        id: a.id,
        file_type: a.file_type || (a as any).content_type || "file",
        data_url: a.data_url || (a as any).url || (a as any).file_url,
        file_size: a.file_size,
        extension: a.extension ?? null,
      }));

    const senderName = (sender.name as string) || (assignee?.name as string) || null;

    return {
      isChatwoot: true,
      message: content,
      eventMessageId: eventMessageId ? String(eventMessageId) : null,
      externalUserId,
      contactName: (contactMeta.name as string) || null,
      contactAvatarUrl: (contactMeta.thumbnail as string) || (contactMeta.avatar_url as string) || null,
      chatwootConversationId: convId,
      chatwootContactId: Number(contactMeta.id ?? 0) || null,
      channel: (conversation.channel as string) || "chatwoot",
      attachments,
      assigneeId,
      assigneeName,
      senderName,
    };
  }
  return {
    isChatwoot: false,
    message: "",
    eventMessageId: null as string | null,
    externalUserId: "",
    contactName: null as string | null,
    contactAvatarUrl: null as string | null,
    chatwootConversationId: null,
    chatwootContactId: null as number | null,
    channel: "",
    attachments: [] as ChatwootAttachment[],
    assigneeId: null as number | null,
    assigneeName: null as string | null,
    senderName: null as string | null,
  };
}

const processedEvents = new Map<string, number>();
const TTL_MS = 10 * 60 * 1000;

function markOrCheckProcessedEvent(eventKey: string): boolean {
  const now = Date.now();
  for (const [k, ts] of processedEvents.entries()) {
    if (now - ts > TTL_MS) processedEvents.delete(k);
  }
  if (processedEvents.has(eventKey)) return true;
  processedEvents.set(eventKey, now);
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
    return history.slice(-20).some((m: any) => {
      if (m.role !== "user") return false;
      const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (!createdAt || now - createdAt > windowSeconds * 1000) return false;
      return normalizeContent(String(m.content || "")) === normalizedIncoming;
    });
  } catch {
    return false;
  }
}

/** Verifica se a mensagem "incoming" é provável eco de alguma mensagem do bot (WhatsApp/Chatwoot às vezes repete). Compara com as últimas N mensagens do assistente. */
function isLikelyEchoContent(incoming: string, assistant: string): boolean {
  if (incoming === assistant) return true;
  const a = incoming.length;
  const b = assistant.length;
  if (a < 10 || b < 10) return false;
  const shorter = a <= b ? incoming : assistant;
  const longer = a <= b ? assistant : incoming;
  return longer.includes(shorter) && shorter.length >= Math.min(longer.length * 0.7, 15);
}

async function isLikelyEchoOfBotMessage(
  supabase: any,
  agentId: string,
  convId: string,
  incomingText: string,
  windowSeconds = 180
): Promise<boolean> {
  try {
    const { data: history } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: agentId,
      p_conversation_id: convId,
    });
    if (!history || !Array.isArray(history) || history.length === 0) return false;
    const normalizedIncoming = normalizeContent(incomingText);
    if (!normalizedIncoming || normalizedIncoming.length < 5) return false;
    const now = Date.now();
    let checked = 0;
    for (let i = history.length - 1; i >= 0 && checked < 10; i--) {
      const m = history[i];
      if (m.role !== "assistant") continue;
      checked++;
      const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (!createdAt || now - createdAt > windowSeconds * 1000) continue;
      const norm = normalizeContent(String(m.content || ""));
      if (norm === normalizedIncoming || isLikelyEchoContent(normalizedIncoming, norm)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

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
  if (error) return null;
  return data as { id: string; created_at: string };
}

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/webhooks",
    async (req: FastifyRequest<{ Querystring: { agent_id?: string } }>, reply: FastifyReply) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({ error: "Missing server configuration" });
      }

      let body = req.body as Record<string, unknown>;
      if (Array.isArray(body) && body.length > 0) {
        body = body[0] as Record<string, unknown>;
      }

      const payload =
        body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : body.body && typeof body.body === "object" && !Array.isArray(body.body)
            ? (body.body as Record<string, unknown>)
            : body;


      if (payload.event && payload.event !== "message_created") {
        return reply.send({ status: "ignored", reason: `Event '${payload.event}' not handled` });
      }

      // Debug: log payload structure quando content vazio (ajuda a identificar formato do Chatwoot)
      const rawContent = (payload.content as string) || (payload as any).message?.content;
      if (!rawContent && payload.event === "message_created") {
        console.log("[Webhook] message_created sem content em payload | keys=" + Object.keys(payload).join(",") + " | message_keys=" + (payload.message ? Object.keys(payload.message as object).join(",") : "n/a"));
      }

      const agentId = req.query?.agent_id || (body.agent_id as string) || (payload.agent_id as string) || null;
      if (!agentId) {
        return reply.status(400).send({ error: "Missing 'agent_id'" });
      }

      const supabase = createNexusClient();

      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, name, status, tenant_id, config")
        .eq("id", agentId)
        .maybeSingle();

      if (agentErr || !agent) {
        console.warn("[Webhook] Agent lookup failed agent=" + agentId + " err=" + (agentErr?.message ?? agentErr));
        return reply.status(401).send({ error: "Invalid agent_id" });
      }

      const cfg = (agent.config || {}) as Record<string, any>;
      const mt = payload.message_type ?? (payload as any).message?.message_type;
      const isOutgoing =
        mt === "outgoing" ||
        mt === 1 ||
        mt === "1" ||
        (typeof mt === "string" && mt.toLowerCase() === "outgoing");

      // Branch para mensagens outgoing: sincronizar respostas do humano no banco
      if (payload.event === "message_created" && isOutgoing) {
        if (payload.private === true) {
          return reply.send({ status: "ignored", reason: "Private note" });
        }
        const parsed = parseChatwootPayloadOutgoing(payload);
        if (!parsed.isChatwoot || !parsed.chatwootConversationId) {
          return reply.send({ status: "ignored", reason: "Outgoing — payload inválido" });
        }
        const agentAssigneeId = cfg.agent_assignee_id != null ? Number(cfg.agent_assignee_id) : null;
        if (parsed.assigneeId === agentAssigneeId) {
          return reply.send({ status: "ignored", reason: "Outgoing — mensagem do bot, não processar" });
        }
        if (!parsed.assigneeId) {
          return reply.send({ status: "ignored", reason: "Outgoing — sem assignee" });
        }
        // Sempre sincronizar respostas do humano no banco (centralização para o gestor), mesmo com agente em teste/inativo
        const contentToSave =
          (parsed.message || "").trim() ||
          (parsed.attachments.length > 0 ? "[Mídia enviada pelo atendente]" : "");
        if (!contentToSave) {
          return reply.send({ status: "ignored", reason: "Outgoing — sem conteúdo" });
        }
        if (parsed.eventMessageId) {
          const eventKey = `outgoing:${agentId}:${parsed.eventMessageId}`;
          if (markOrCheckProcessedEvent(eventKey)) {
            return reply.send({ status: "ignored_duplicate", reason: "Duplicate webhook event" });
          }
        }
        try {
          const { data: convData } = await supabase.rpc("find_or_create_webhook_conversation", {
            p_agent_id: agentId,
            p_channel: parsed.channel,
            p_external_user_id: parsed.externalUserId,
            p_chatwoot_conversation_id: parsed.chatwootConversationId,
            p_chatwoot_contact_id: parsed.chatwootContactId,
            p_contact_name: parsed.contactName,
            p_contact_avatar_url: parsed.contactAvatarUrl,
            p_chatwoot_assignee_name: parsed.assigneeName,
          });
          const convId = Array.isArray(convData) ? convData[0] : convData;
          if (convId) {
            const metadata: Record<string, unknown> = parsed.eventMessageId
              ? { source: "chatwoot_human", chatwoot_message_id: parsed.eventMessageId }
              : { source: "chatwoot_human" };
            if (parsed.senderName) metadata.sender_name = parsed.senderName;
            if (parsed.attachments.length > 0) {
              metadata.attachments = parsed.attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url }));
            }
            const { error: saveErr } = await supabase.rpc("save_message", {
              p_agent_id: agentId,
              p_conversation_id: convId,
              p_role: "assistant",
              p_content: contentToSave,
              p_model: null,
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: 0,
              p_metadata: metadata,
            });
            if (saveErr) {
              console.error("[Webhook] Failed to save human reply:", saveErr.message);
              return reply.status(500).send({ error: "Failed to save message", detail: saveErr.message });
            }
          }
        } catch (e: any) {
          console.error("[Webhook] Outgoing human sync failed:", e?.message);
          return reply.status(500).send({ error: "Failed to sync human reply", detail: e?.message });
        }
        return reply.send({
          status: "saved_no_ai",
          reason: "Human reply synced",
        });
      }

      if (payload.event === "message_created") {
        const notIncoming = mt !== "incoming" && mt !== "0" && (mt as number) !== 0;
        if (notIncoming) {
          return reply.send({ status: "ignored", reason: "Not an incoming message" });
        }
      }

      let chatwoot = parseChatwootPayload(payload);

      if (chatwoot.isChatwoot && payload.event === "message_created") {
        const hasAttachments = (payload.attachments as any[])?.length > 0 || (payload as any).conversation?.messages?.[0]?.attachments?.length > 0;
        if (!hasAttachments && ((payload.content as string) || "").length <= 15) {
          console.log(`[Webhook] incoming image? | payload.attachments=${(payload.attachments as any[])?.length ?? "n/a"} conv.messages[0].attachments=${(payload as any).conversation?.messages?.[0]?.attachments?.length ?? "n/a"} parsed=${chatwoot.attachments.length}`);
        }
      }

      // Fallback: webhook às vezes não inclui attachments (Chatwoot issue #8999). Buscar via API.
      if (
        chatwoot.isChatwoot &&
        chatwoot.attachments.length === 0 &&
        chatwoot.chatwootConversationId &&
        chatwoot.eventMessageId &&
        cfg.chatwoot_url &&
        cfg.chatwoot_account_id &&
        cfg.chatwoot_api_token
      ) {
        console.log(`[Webhook] Incoming sem attachments. Buscando via API | conv=${chatwoot.chatwootConversationId} msg=${chatwoot.eventMessageId}`);
        const apiAttachments = await fetchChatwootMessageAttachments(
          cfg,
          chatwoot.chatwootConversationId,
          chatwoot.eventMessageId,
          agentId,
          (chatwoot as any).chatwootConversationDisplayId
        );
        if (apiAttachments.length > 0) {
          chatwoot = { ...chatwoot, attachments: apiAttachments };
          console.log(`[Webhook] agent=${agentId?.slice(0, 8)}… | fetched ${apiAttachments.length} attachment(s) via Chatwoot API`);
        }
      }

      // Quando agente não está ativo: sempre sincronizar mensagens no banco (Chat ao Vivo para o gestor),
      // mas nunca acionar a IA. Centraliza leitura de todos os atendimentos (humanos + IA).
      if (agent.status !== "active" && chatwoot.isChatwoot) {
        try {
          const { data: convData } = await supabase.rpc("find_or_create_webhook_conversation", {
            p_agent_id: agentId,
            p_channel: chatwoot.channel,
            p_external_user_id: chatwoot.externalUserId,
            p_chatwoot_conversation_id: chatwoot.chatwootConversationId,
            p_chatwoot_contact_id: chatwoot.chatwootContactId,
            p_contact_name: chatwoot.contactName,
            p_contact_avatar_url: chatwoot.contactAvatarUrl,
            p_chatwoot_assignee_name: chatwoot.assigneeName,
          });
          const newConvId = Array.isArray(convData) ? convData[0] : convData;
          upsertCrmContact(supabase, agent.tenant_id, chatwoot.externalUserId, chatwoot.contactName, chatwoot.contactAvatarUrl).catch(() => {});
          const rawUserContent = (chatwoot.message || "").trim() || (chatwoot.attachments.length > 0 ? "[Mídia enviada pelo cliente]" : "");
          let contentToSave = rawUserContent ? stripChatwootNamePrefix(rawUserContent) : rawUserContent;
          if (!contentToSave && chatwoot.attachments.length > 0) contentToSave = "[Mídia enviada pelo cliente]";
          if (newConvId && contentToSave) {
            const likelyEcho = await isLikelyEchoOfBotMessage(supabase, agentId, newConvId, contentToSave, 120);
            if (likelyEcho) {
              return reply.send({ status: "ignored", reason: "Echo do bot detectado" });
            }
            const { data: cancelled } = await supabase.rpc("cancel_pending_followups", {
              p_agent_id: agentId,
              p_conversation_id: newConvId,
              p_cancel_reason: "user_replied",
            });
            if (cancelled && cancelled > 0) {
              await supabase
                .from("follow_up_queue")
                .update({ cancel_reason: "user_replied", updated_at: new Date().toISOString() })
                .eq("agent_id", agentId)
                .eq("conversation_id", newConvId)
                .eq("status", "cancelled")
                .is("cancel_reason", null);
            }
            const userMetadata = chatwoot.attachments.length > 0
              ? { attachments: chatwoot.attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url })) }
              : undefined;
            const { error: saveErr } = await supabase.rpc("save_message", {
              p_agent_id: agentId,
              p_conversation_id: newConvId,
              p_role: "user",
              p_content: contentToSave,
              p_model: null,
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: 0,
              ...(userMetadata && { p_metadata: userMetadata }),
            });
            if (saveErr) {
              console.error("[Webhook] save_message failed (agent not active):", saveErr.message);
            }
          } else if (newConvId && !contentToSave) {
            console.warn("[Webhook] Skipped save: no content (convId=" + newConvId?.slice(0, 8) + " contentLen=" + (chatwoot.message?.length ?? 0) + ")");
          } else if (!newConvId) {
            console.warn("[Webhook] find_or_create returned no convId for agent=" + agentId?.slice(0, 8));
          }
        } catch (e: any) {
          console.warn("[Webhook] Failed to save (agent not active):", e.message);
        }
        return reply.send({
          status: "saved_no_ai",
          reason: `Agent ${agent.status}; messages synced for manager visibility`,
        });
      }

      let userMessage: string;
      let externalUserId: string;
      let channel: string;
      let chatwootConversationId: number | null = null;
      let chatwootContactId: number | null = null;
      let contactName: string | null = null;
      let contactAvatarUrl: string | null = null;

      if (chatwoot.isChatwoot) {
        const isTestWithMatchingAssignee =
          agent.status === "test" &&
          cfg.test_assignee_id != null &&
          chatwoot.assigneeId === Number(cfg.test_assignee_id);

        const agentAssigneeId = cfg.agent_assignee_id != null ? Number(cfg.agent_assignee_id) : null;
        const isAgentOwnConversation = agentAssigneeId != null && chatwoot.assigneeId === agentAssigneeId;
        const shouldBlockForHuman = chatwoot.assigneeId && !isTestWithMatchingAssignee && !isAgentOwnConversation;

        if (shouldBlockForHuman) {
          try {
            const { data: convData } = await supabase.rpc("find_or_create_webhook_conversation", {
              p_agent_id: agentId,
              p_channel: chatwoot.channel,
              p_external_user_id: chatwoot.externalUserId,
              p_chatwoot_conversation_id: chatwoot.chatwootConversationId,
              p_chatwoot_contact_id: chatwoot.chatwootContactId,
              p_contact_name: chatwoot.contactName,
              p_contact_avatar_url: chatwoot.contactAvatarUrl,
              p_chatwoot_assignee_name: chatwoot.assigneeName,
            });
          const newConvId = Array.isArray(convData) ? convData[0] : convData;
          upsertCrmContact(supabase, agent.tenant_id, chatwoot.externalUserId, chatwoot.contactName, chatwoot.contactAvatarUrl).catch(() => {});
          const rawUserContent = (chatwoot.message || "").trim() || (chatwoot.attachments.length > 0 ? "[Mídia enviada pelo cliente]" : "");
          let contentToSave = rawUserContent ? stripChatwootNamePrefix(rawUserContent) : rawUserContent;
          if (!contentToSave && chatwoot.attachments.length > 0) contentToSave = "[Mídia enviada pelo cliente]";
          if (newConvId && contentToSave) {
            const likelyEcho = await isLikelyEchoOfBotMessage(supabase, agentId, newConvId, contentToSave, 120);
            if (likelyEcho) {
              return reply.send({ status: "ignored", reason: "Echo do bot detectado" });
            }
            const { data: cancelled } = await supabase.rpc("cancel_pending_followups", {
              p_agent_id: agentId,
              p_conversation_id: newConvId,
              p_cancel_reason: "user_replied",
            });
            if (cancelled && cancelled > 0) {
              await supabase
                .from("follow_up_queue")
                .update({ cancel_reason: "user_replied", updated_at: new Date().toISOString() })
                .eq("agent_id", agentId)
                .eq("conversation_id", newConvId)
                .eq("status", "cancelled")
                .is("cancel_reason", null);
                console.log(`[FollowUp] Webhook (human-assigned) cancelou ${cancelled} follow-up(s) | conv=${newConvId?.slice(0, 8)}…`);
              }
              const userMetadata = chatwoot.attachments.length > 0
                ? { attachments: chatwoot.attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url })) }
                : undefined;
              const { error: saveErr } = await supabase.rpc("save_message", {
                p_agent_id: agentId,
                p_conversation_id: newConvId,
                p_role: "user",
                p_content: contentToSave,
                p_model: null,
                p_tokens_input: 0,
                p_tokens_output: 0,
                p_latency_ms: 0,
                ...(userMetadata && { p_metadata: userMetadata }),
              });
              if (saveErr) {
                console.error("[Webhook] save_message failed (human-assigned):", saveErr.message);
              }
            }
          } catch (e: any) {
            console.warn("[Webhook] Failed to save for human-assigned:", e.message);
          }
          return reply.send({
            status: "saved_no_ai",
            reason: `Human agent assigned: ${chatwoot.assigneeName || chatwoot.assigneeId}`,
          });
        }

        userMessage = (stripChatwootNamePrefix(chatwoot.message || "") || chatwoot.message || "").trim();
        externalUserId = chatwoot.externalUserId;
        channel = chatwoot.channel;
        chatwootConversationId = chatwoot.chatwootConversationId;
        chatwootContactId = chatwoot.chatwootContactId;
        contactName = chatwoot.contactName;
        contactAvatarUrl = chatwoot.contactAvatarUrl;
      } else {
        userMessage = (payload.message as string) || (payload.text as string) || (payload.content as string) || "";
        externalUserId = (payload.external_user_id || payload.from || payload.sender || payload.phone || "anonymous") as string;
        channel = (payload.channel || "webhook") as string;
      }

      let isDuplicateWithAttachments = false;
      if (chatwoot.isChatwoot && chatwoot.eventMessageId) {
        const eventKey = `${agentId}:${chatwoot.eventMessageId}`;
        const isDuplicate = markOrCheckProcessedEvent(eventKey);
        if (isDuplicate) {
          if (chatwoot.attachments.length > 0) {
            isDuplicateWithAttachments = true;
          } else {
            return reply.send({ status: "ignored_duplicate", reason: "Duplicate webhook event" });
          }
        }
      }

      if (!userMessage && (!chatwoot.isChatwoot || chatwoot.attachments.length === 0)) {
        return reply.status(400).send({ error: "No message content" });
      }

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
          p_chatwoot_assignee_name: chatwoot.isChatwoot ? chatwoot.assigneeName : undefined,
        });
        earlyConvId = existingConvId;
        if (earlyConvId && (externalUserId || contactName)) {
          upsertCrmContact(supabase, agent.tenant_id, externalUserId, contactName, contactAvatarUrl).catch(() => {});
        }
        if (earlyConvId) {
          const likelyEcho = userMessage?.trim()
            ? await isLikelyEchoOfBotMessage(supabase, agentId, earlyConvId, userMessage, 300)
            : false;
          if (likelyEcho) {
            console.log(`[FollowUp] Webhook ignorado (eco do bot) | conv=${earlyConvId?.slice(0, 8)}…`);
            return reply.send({ status: "ignored", reason: "Echo do bot detectado" });
          }
          {
            const { data: cancelled } = await supabase.rpc("cancel_pending_followups", {
              p_agent_id: agentId,
              p_conversation_id: earlyConvId,
              p_cancel_reason: "user_replied",
            });
            if (cancelled && cancelled > 0) {
              // Fallback: garantir cancel_reason mesmo se migração 20260311120000 não aplicada
              await supabase
                .from("follow_up_queue")
                .update({ cancel_reason: "user_replied", updated_at: new Date().toISOString() })
                .eq("agent_id", agentId)
                .eq("conversation_id", earlyConvId)
                .eq("status", "cancelled")
                .is("cancel_reason", null);
              console.log(`[FollowUp] Webhook cancelou ${cancelled} follow-up(s) | conv=${earlyConvId?.slice(0, 8)}… | motivo=user_replied | content="${String(userMessage || "").slice(0, 60)}…"`);
            }
          }
        }
      } catch (e) {
        console.warn("[Webhook] Early cancel failed:", e);
      }

      if (earlyConvId && userMessage && !isDuplicateWithAttachments) {
        const duplicated = await hasRecentDuplicateIncoming(
          supabase,
          agentId,
          earlyConvId,
          userMessage,
          45
        );
        if (duplicated) {
          return reply.send({
            status: "ignored_duplicate",
            reason: "Recent identical incoming already processed",
          });
        }
      }

      if (chatwoot.isChatwoot) {
        const debounceMs = Number(cfg.message_debounce_ms) || 3000;
        let bufferCreatedAt: string | null = null;

        if (debounceMs > 0) {
          const buffered = await bufferMessage(
            supabase,
            agentId,
            externalUserId,
            channel,
            userMessage,
            chatwootConversationId
          );
          bufferCreatedAt = buffered?.created_at || null;
        }

        // Mensagem do usuário é salva apenas na queue para evitar duplicata no Chat ao Vivo.
        const processQueueUrl = `${API_BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/queue/process`;
        const payload = {
          agent_id: agentId,
          tenant_id: agent.tenant_id,
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
          ...(chatwoot.eventMessageId && { chatwoot_message_id: chatwoot.eventMessageId }),
        };

        try {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 1500);
          const resp = await fetch(processQueueUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          if (resp.ok) {
            msgLog.webhookQueued(agentId);
            return reply.status(202).send({
              status: "queued",
              agent_id: agentId,
              conversation_id: earlyConvId,
            });
          }

          const respText = await resp.text().catch(() => "");
          msgLog.webhookQueueFailed(agentId, resp.status, respText);
          if (earlyConvId && (userMessage?.trim() || chatwoot.attachments.length > 0)) {
            try {
              const contentToSave =
                (userMessage?.trim() ? stripChatwootNamePrefix(userMessage) : null) ||
                (chatwoot.attachments.length > 0 ? "[Mídia enviada pelo cliente]" : null);
              if (contentToSave) {
                const fallbackAttachments = chatwoot.attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url }));
                const fallbackMetadata =
                  chatwoot.attachments.length > 0 || chatwoot.eventMessageId
                    ? { ...(fallbackAttachments.length > 0 && { attachments: fallbackAttachments }), ...(chatwoot.eventMessageId && { chatwoot_message_id: chatwoot.eventMessageId }) }
                    : undefined;
                if (chatwoot.eventMessageId && fallbackAttachments.length > 0) {
                  const { data: updated } = await supabase.rpc("update_message_attachments", {
                    p_agent_id: agentId,
                    p_conversation_id: earlyConvId,
                    p_chatwoot_message_id: chatwoot.eventMessageId,
                    p_attachments: fallbackAttachments,
                  });
                  if (updated && Number(updated) > 0) {
                    /* message updated, skip insert */
                  } else {
                    await supabase.rpc("save_message", {
                      p_agent_id: agentId,
                      p_conversation_id: earlyConvId,
                      p_role: "user",
                      p_content: contentToSave,
                      p_model: null,
                      p_tokens_input: 0,
                      p_tokens_output: 0,
                      p_latency_ms: 0,
                      ...(fallbackMetadata && { p_metadata: fallbackMetadata }),
                    });
                  }
                } else {
                  await supabase.rpc("save_message", {
                    p_agent_id: agentId,
                    p_conversation_id: earlyConvId,
                    p_role: "user",
                    p_content: contentToSave,
                    p_model: null,
                    p_tokens_input: 0,
                    p_tokens_output: 0,
                    p_latency_ms: 0,
                    ...(fallbackMetadata && { p_metadata: fallbackMetadata }),
                  });
                }
              }
            } catch (saveErr: any) {
              console.error("[Webhook] Fallback save failed:", saveErr?.message);
            }
          }

          return reply.status(502).send({
            error: "Queue dispatch failed",
            detail: `process-queue status=${resp.status} body=${respText}`,
          });
        } catch (e: any) {
          if (e.name === "AbortError") {
            msgLog.webhookQueueTimeout(agentId);
            return reply.status(202).send({
              status: "queued",
              agent_id: agentId,
              conversation_id: earlyConvId,
            });
          }
          if (earlyConvId && (userMessage?.trim() || chatwoot.attachments.length > 0)) {
            try {
              const contentToSave =
                (userMessage?.trim() ? stripChatwootNamePrefix(userMessage) : null) ||
                (chatwoot.attachments.length > 0 ? "[Mídia enviada pelo cliente]" : null);
              if (contentToSave) {
                const fallbackAttachments = chatwoot.attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url }));
                const fallbackMetadata =
                  chatwoot.attachments.length > 0 || chatwoot.eventMessageId
                    ? { ...(fallbackAttachments.length > 0 && { attachments: fallbackAttachments }), ...(chatwoot.eventMessageId && { chatwoot_message_id: chatwoot.eventMessageId }) }
                    : undefined;
                if (chatwoot.eventMessageId && fallbackAttachments.length > 0) {
                  const { data: updated } = await supabase.rpc("update_message_attachments", {
                    p_agent_id: agentId,
                    p_conversation_id: earlyConvId,
                    p_chatwoot_message_id: chatwoot.eventMessageId,
                    p_attachments: fallbackAttachments,
                  });
                  if (updated && Number(updated) > 0) {
                    /* message updated, skip insert */
                  } else {
                    await supabase.rpc("save_message", {
                      p_agent_id: agentId,
                      p_conversation_id: earlyConvId,
                      p_role: "user",
                      p_content: contentToSave,
                      p_model: null,
                      p_tokens_input: 0,
                      p_tokens_output: 0,
                      p_latency_ms: 0,
                      ...(fallbackMetadata && { p_metadata: fallbackMetadata }),
                    });
                  }
                } else {
                  await supabase.rpc("save_message", {
                    p_agent_id: agentId,
                    p_conversation_id: earlyConvId,
                    p_role: "user",
                    p_content: contentToSave,
                    p_model: null,
                    p_tokens_input: 0,
                    p_tokens_output: 0,
                    p_latency_ms: 0,
                    ...(fallbackMetadata && { p_metadata: fallbackMetadata }),
                  });
                }
              }
            } catch (saveErr: any) {
              console.error("[Webhook] Fallback save failed:", saveErr?.message);
            }
          }
          return reply.status(502).send({
            error: "Queue dispatch failed",
            detail: e?.message || "unknown fetch error",
          });
        }
      }

      console.warn("[Webhook] Falling through to sync_path_not_implemented:", {
        isChatwoot: chatwoot.isChatwoot,
        event: payload.event,
        message_type: payload.message_type,
      });
      return reply.status(200).send({
        status: "sync_path_not_implemented",
        message: "Non-Chatwoot sync path - use Chatwoot for full flow",
      });
    }
  );
}
