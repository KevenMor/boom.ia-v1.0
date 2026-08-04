import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix } from "../utils/sanitize.js";
import { msgLog } from "../utils/flow-logger.js";
import { upsertCrmContact } from "../services/crm-contact-sync.js";
import { getChatwootAuthHeaders } from "../services/delivery.js";
import { isTenantAiGloballyDisabled } from "../services/tenant-ai-global.js";
import {
  isLikelyEchoAgainstHistory,
  normalizeWebhookContent,
} from "../utils/webhook-echo.js";

const API_BASE = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

interface ChatwootAttachment {
  id: number;
  file_type: string;
  data_url: string;
  file_size?: number;
  extension?: string | null;
}

function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test((s || "").trim());
}

/** Resolve avatar path relativo do Chatwoot (ActiveStorage) para URL absoluta. */
function resolveChatwootAvatarUrl(raw: string | null | undefined, chatwootBaseUrl: string | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (isAbsoluteHttpUrl(t)) return t;
  const base = chatwootBaseUrl?.replace(/\/+$/, "");
  if (base && t.startsWith("/")) return `${base}${t}`;
  return null;
}

/** Mesma ideia do avatar: ActiveStorage/Devise emite paths `/rails/active_storage/...` — o browser do gestor não resolve contra o Boom. */
function resolveChatwootAttachmentDataUrl(raw: string | null | undefined, chatwootBaseUrl: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^(data:|blob:)/i.test(t)) return t;
  if (isAbsoluteHttpUrl(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  const base = chatwootBaseUrl?.replace(/\/+$/, "");
  if (base && t.startsWith("/")) return `${base}${t}`;
  return t;
}

const CHATWOOT_FILE_TYPE_FROM_NUM: Record<number, string> = { 0: "image", 1: "audio", 2: "video", 3: "file" };

function inferAttachmentFileType(att: Record<string, unknown>, dataUrl: string): string {
  const ftRaw = att.file_type;
  if (typeof ftRaw === "number" && CHATWOOT_FILE_TYPE_FROM_NUM[ftRaw]) return CHATWOOT_FILE_TYPE_FROM_NUM[ftRaw];
  if (typeof ftRaw === "string" && ftRaw.trim()) return ftRaw.trim();
  const mime = typeof att.content_type === "string" ? att.content_type.toLowerCase() : "";
  if (mime.includes("audio")) return "audio";
  if (mime.includes("video")) return "video";
  if (mime.includes("image")) return "image";
  const u = dataUrl.split("?")[0].toLowerCase();
  if (/\.(opus|oga|ogg|mp3|m4a|aac|wav|amr)$/i.test(u)) return "audio";
  if (/\.webm$/i.test(u)) return "audio";
  if (/\.(mp4|mov|m4v)$/i.test(u)) return "video";
  if (/\.(jpe?g|png|gif|webp)$/i.test(u)) return "image";
  return "file";
}

function normalizeChatwootAttachmentsForStorage(
  attachments: ChatwootAttachment[],
  cwBase: string | undefined
): ChatwootAttachment[] {
  return attachments
    .map((a) => {
      const data_url = resolveChatwootAttachmentDataUrl(a.data_url, cwBase);
      const file_type =
        inferAttachmentFileType({ ...a } as Record<string, unknown>, data_url) || a.file_type || "file";
      return { ...a, data_url, file_type };
    })
    .filter((a) => !!a.data_url);
}

/**
 * Busca attachments de uma mensagem via API Chatwoot.
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
    return extractAttachmentsFromMessage(msg, messageId, agentId, baseUrl);
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
    return extractAttachmentsFromMessage(msg, messageId, agentId, baseUrl);
  };

  const extractAttachmentsFromMessage = (
    msg: Record<string, unknown>,
    messageId: string,
    agentId?: string,
    cwBase?: string
  ): ChatwootAttachment[] => {
    let raw = (((msg.attachments || []) as any[]).concat(
      msg.attachment ? [msg.attachment] : []
    )) as Record<string, unknown>[];
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
        const hinted = inferAttachmentFileType(contentAttrs as Record<string, unknown>, extUrl);
        raw = [{ data_url: extUrl, file_type: hinted, url: extUrl, external_url: extUrl }];
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
    const getUrl = (a: any) =>
      urlKeys.map((k) => a?.[k]).find((u) => typeof u === "string" && String(u).trim().length > 0);
    const mergedHint = {
      ...(typeof msg.content_type === "string" ? { content_type: msg.content_type } : {}),
    } as Record<string, unknown>;
    return raw
      .filter((a) => !!getUrl(a))
      .map((a) => {
        const merged = { ...mergedHint, ...a } as Record<string, unknown>;
        const resolved = resolveChatwootAttachmentDataUrl(String(getUrl(a)), cwBase);
        const file_type = inferAttachmentFileType(merged, resolved || "");
        return {
          id: Number(a.id) || 0,
          file_type,
          data_url: resolved,
          file_size: a.file_size as number | undefined,
          extension: (a.extension as string | null) ?? null,
        };
      })
      .filter((a) => !!a.data_url);
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

/**
 * Extrai URL de foto de perfil do objeto contact/sender no payload Chatwoot (webhook ou API).
 * Versões diferentes enviam thumbnail, avatar_url, avatar, ou aninham em additional_attributes (ex.: WhatsApp).
 */
function avatarUrlFromChatwootObject(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj || typeof obj !== "object") return null;
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim() && (isAbsoluteHttpUrl(v) || v.trim().startsWith("/"))) return v.trim();
    }
    return null;
  };
  const direct = pick(
    obj.thumbnail,
    obj.avatar_url,
    obj.avatar,
    (obj as { thumb_url?: string }).thumb_url,
    (obj as { profile_image_url?: string }).profile_image_url,
    (obj as { picture?: string }).picture,
    (obj as { image_url?: string }).image_url
  );
  if (direct) return direct;

  const scanRecord = (r: Record<string, unknown>): string | null =>
    pick(
      r.avatar_url,
      r.avatar,
      r.thumbnail,
      (r as { profile_pic?: string }).profile_pic,
      (r as { profile_picture?: string }).profile_picture,
      (r as { profile_picture_url?: string }).profile_picture_url,
      (r as { profile_photo_url?: string }).profile_photo_url,
      (r as { wa_profile_pic_url?: string }).wa_profile_pic_url,
      (r as { whatsapp_profile_picture?: string }).whatsapp_profile_picture
    );

  const add = obj.additional_attributes;
  if (add && typeof add === "object" && !Array.isArray(add)) {
    const fromAdd = scanRecord(add as Record<string, unknown>);
    if (fromAdd) return fromAdd;
  }
  if (typeof add === "string" && add.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(add) as Record<string, unknown>;
      const fromJson = scanRecord(parsed);
      if (fromJson) return fromJson;
    } catch {
      /* ignore */
    }
  }

  const cust = obj.custom_attributes;
  if (cust && typeof cust === "object" && !Array.isArray(cust)) {
    const fromCust = scanRecord(cust as Record<string, unknown>);
    if (fromCust) return fromCust;
  }

  return null;
}

function extractChatwootIncomingAvatar(
  body: Record<string, unknown>,
  contactMeta: Record<string, unknown>,
  sender: Record<string, unknown>,
  conversation: Record<string, unknown>,
  conversationMeta: Record<string, unknown>
): string | null {
  const metaSender = (conversationMeta.sender || {}) as Record<string, unknown>;
  const convContact = (conversation.contact || {}) as Record<string, unknown>;
  const rootContact = (body.contact || {}) as Record<string, unknown>;

  return (
    avatarUrlFromChatwootObject(contactMeta) ||
    avatarUrlFromChatwootObject(sender) ||
    avatarUrlFromChatwootObject(metaSender) ||
    avatarUrlFromChatwootObject(convContact) ||
    avatarUrlFromChatwootObject(rootContact) ||
    null
  );
}

/** Busca contato na API Chatwoot quando o webhook não traz avatar (comum em alguns canais). */
async function fetchChatwootContactAvatarUrl(
  cfg: Record<string, unknown>,
  contactId: number,
  agentId?: string
): Promise<string | null> {
  const baseUrl = (cfg.chatwoot_url as string)?.replace(/\/+$/, "");
  const accountId = cfg.chatwoot_account_id;
  const apiToken = cfg.chatwoot_api_token as string;
  if (!baseUrl || !accountId || !apiToken || !contactId || contactId <= 0) return null;

  const auth = getChatwootAuthHeaders(apiToken, cfg);
  const url = `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...auth },
    });
    if (!resp.ok) {
      if (agentId) {
        console.warn(`[Webhook] Chatwoot GET contact ${contactId}:`, resp.status, (await resp.text().catch(() => "")).slice(0, 120));
      }
      return null;
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const payload = (data.payload ?? data) as Record<string, unknown>;
    const contact = (payload?.contact ?? payload) as Record<string, unknown>;
    const raw = avatarUrlFromChatwootObject(contact) || avatarUrlFromChatwootObject(payload);
    return resolveChatwootAvatarUrl(raw, baseUrl);
  } catch (e) {
    if (agentId) console.warn(`[Webhook] fetchChatwootContactAvatarUrl failed:`, (e as Error)?.message);
    return null;
  }
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
      .map((a): ChatwootAttachment | null => {
        const data_urlRaw = String(a.data_url || (a as any).url || (a as any).file_url || "").trim();
        if (!data_urlRaw) return null;
        const file_type = inferAttachmentFileType(a as unknown as Record<string, unknown>, data_urlRaw);
        return {
          id: Number(a.id) || 0,
          file_type,
          data_url: data_urlRaw,
          file_size: a.file_size,
          extension: a.extension ?? null,
        };
      })
      .filter((a): a is ChatwootAttachment => a !== null);

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
      contactName:
        (contactMeta.name as string) ||
        (sender.name as string) ||
        (metaSender.name as string) ||
        null,
      contactAvatarUrl: extractChatwootIncomingAvatar(body, contactMeta, sender, conversation, conversationMeta),
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
      .map((a): ChatwootAttachment | null => {
        const data_urlRaw = String(a.data_url || (a as any).url || (a as any).file_url || "").trim();
        if (!data_urlRaw) return null;
        const file_type = inferAttachmentFileType(a as unknown as Record<string, unknown>, data_urlRaw);
        return {
          id: Number(a.id) || 0,
          file_type,
          data_url: data_urlRaw,
          file_size: a.file_size,
          extension: a.extension ?? null,
        };
      })
      .filter((a): a is ChatwootAttachment => a !== null);

    const senderName = (sender.name as string) || (assignee?.name as string) || null;

    return {
      isChatwoot: true,
      message: content,
      eventMessageId: eventMessageId ? String(eventMessageId) : null,
      externalUserId,
      contactName:
        (contactMeta.name as string) || (metaSender.name as string) || null,
      contactAvatarUrl:
        avatarUrlFromChatwootObject(contactMeta) ||
        avatarUrlFromChatwootObject(metaSender) ||
        null,
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
    const normalizedIncoming = normalizeWebhookContent(incomingText);
    if (!normalizedIncoming) return false;
    return history.slice(-20).some((m: any) => {
      if (m.role !== "user") return false;
      const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
      if (!createdAt || now - createdAt > windowSeconds * 1000) return false;
      return normalizeWebhookContent(String(m.content || "")) === normalizedIncoming;
    });
  } catch {
    return false;
  }
}

/**
 * Eco do bot (WhatsApp/Chatwoot às vezes devolve a fala da IA como incoming).
 * Mensagens de atendente humano (`metadata.source = chatwoot_human`) NÃO contam —
 * senão o cliente que manda o mesmo texto após handoff/sync humano fica bloqueado.
 */
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
    return isLikelyEchoAgainstHistory(incomingText, history, windowSeconds);
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
        const cwBaseOut = (cfg.chatwoot_url as string | undefined)?.replace(/\/+$/, "");
        // Só grava URL absoluta (path relativo do ActiveStorage quebra no painel Boom).
        let outgoingAvatar = resolveChatwootAvatarUrl(parsed.contactAvatarUrl, cwBaseOut);
        if (!outgoingAvatar && parsed.chatwootContactId && cfg.chatwoot_url && cfg.chatwoot_account_id && cfg.chatwoot_api_token) {
          outgoingAvatar = await fetchChatwootContactAvatarUrl(cfg, parsed.chatwootContactId, agentId);
        }
        try {
          const { data: convData } = await supabase.rpc("find_or_create_webhook_conversation", {
            p_agent_id: agentId,
            p_channel: parsed.channel,
            p_external_user_id: parsed.externalUserId,
            p_chatwoot_conversation_id: parsed.chatwootConversationId,
            p_chatwoot_contact_id: parsed.chatwootContactId,
            p_contact_name: parsed.contactName,
            p_contact_avatar_url: outgoingAvatar,
            p_chatwoot_assignee_name: parsed.assigneeName,
          });
          const convId = Array.isArray(convData) ? convData[0] : convData;
          if (convId) {
            const metadata: Record<string, unknown> = parsed.eventMessageId
              ? { source: "chatwoot_human", chatwoot_message_id: parsed.eventMessageId }
              : { source: "chatwoot_human" };
            if (parsed.senderName) metadata.sender_name = parsed.senderName;
            const outgoingAttachments =
              parsed.attachments.length > 0
                ? normalizeChatwootAttachmentsForStorage(parsed.attachments, cwBaseOut)
                : [];
            if (outgoingAttachments.length > 0) {
              metadata.attachments = outgoingAttachments.map((a) => ({
                file_type: a.file_type,
                data_url: a.data_url,
              }));
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

      if (chatwoot.isChatwoot) {
        const cwBase = (cfg.chatwoot_url as string | undefined)?.replace(/\/+$/, "");
        let next = chatwoot;
        if (next.contactAvatarUrl) {
          const resolvedAvatar = resolveChatwootAvatarUrl(next.contactAvatarUrl, cwBase);
          if (resolvedAvatar) next = { ...next, contactAvatarUrl: resolvedAvatar };
        }
        if (next.attachments.length > 0) {
          next = {
            ...next,
            attachments: normalizeChatwootAttachmentsForStorage(next.attachments, cwBase),
          };
        }
        chatwoot = next;
      }

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
          const cwBaseMerge = (cfg.chatwoot_url as string | undefined)?.replace(/\/+$/, "");
          chatwoot = {
            ...chatwoot,
            attachments: normalizeChatwootAttachmentsForStorage(apiAttachments, cwBaseMerge),
          };
          console.log(`[Webhook] agent=${agentId?.slice(0, 8)}… | fetched ${apiAttachments.length} attachment(s) via Chatwoot API`);
        }
      }

      // Webhook às vezes não traz foto do perfil; API do contato costuma ter avatar_url/thumbnail.
      console.log(`[Webhook:avatar-debug] agent=${agentId?.slice(0, 8)}… | contactAvatarUrl=${chatwoot.contactAvatarUrl ?? "null"} | contact_id=${chatwoot.chatwootContactId ?? "null"} | has_chatwoot_url=${!!cfg.chatwoot_url} | has_token=${!!cfg.chatwoot_api_token}`);
      if (
        chatwoot.isChatwoot &&
        !chatwoot.contactAvatarUrl &&
        chatwoot.chatwootContactId &&
        cfg.chatwoot_url &&
        cfg.chatwoot_account_id &&
        cfg.chatwoot_api_token
      ) {
        const avatarFromApi = await fetchChatwootContactAvatarUrl(cfg, chatwoot.chatwootContactId, agentId);
        console.log(`[Webhook:avatar-debug] agent=${agentId?.slice(0, 8)}… | avatarFromApi=${avatarFromApi ?? "null"}`);
        if (avatarFromApi) {
          chatwoot = { ...chatwoot, contactAvatarUrl: avatarFromApi };
          console.log(`[Webhook] agent=${agentId?.slice(0, 8)}… | contact avatar via Chatwoot API (contact_id=${chatwoot.chatwootContactId})`);
        }
      }

      // Agente inativo OU IA desligada globalmente na tenant: sincronizar mensagens no banco (Chat ao Vivo),
      // mas nunca acionar a IA.
      const tenantAiOff = await isTenantAiGloballyDisabled(supabase, agent.tenant_id);
      if (chatwoot.isChatwoot && (agent.status !== "active" || tenantAiOff)) {
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
          reason: tenantAiOff
            ? "Tenant IA desligada globalmente"
            : `Agent ${agent.status}; messages synced for manager visibility`,
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
        let effectiveDebounceMs = debounceMs;

        if (debounceMs > 0) {
          const buffered = await bufferMessage(
            supabase,
            agentId,
            externalUserId,
            channel,
            userMessage,
            chatwootConversationId
          );
          if (buffered) {
            bufferCreatedAt = buffered.created_at;
          } else {
            // Buffer insert failed — fallback to immediate processing without debounce
            console.warn(`[Webhook] bufferMessage failed for agent ${agentId}, processing without debounce`);
            effectiveDebounceMs = 0;
          }
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
          user_message: effectiveDebounceMs > 0 ? null : userMessage,
          debounce_ms: effectiveDebounceMs,
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
