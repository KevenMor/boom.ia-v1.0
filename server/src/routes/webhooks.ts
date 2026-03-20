import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix } from "../utils/sanitize.js";
import { msgLog } from "../utils/flow-logger.js";
import { upsertCrmContact } from "../services/crm-contact-sync.js";

const API_BASE = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

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

    const assignee = (conversationMeta.assignee || conversation.assignee || null) as Record<string, unknown> | null;
    const assigneeId = assignee ? Number(assignee.id ?? 0) : null;
    const assigneeName = assignee ? (assignee.name as string) || null : null;

    const content =
      (body.content as string) ||
      ((body as any).message?.content as string) ||
      "";

    const convId = (conversation.id as number) ?? (conversation.display_id as number) ?? null;

    return {
      isChatwoot: true,
      message: content,
      eventMessageId: eventMessageId ? String(eventMessageId) : null,
      externalUserId,
      contactName: (contactMeta.name as string) || (sender.name as string) || null,
      contactAvatarUrl: (contactMeta.thumbnail as string) || (contactMeta.avatar_url as string) || (sender.thumbnail as string) || (sender.avatar_url as string) || null,
      chatwootConversationId: convId,
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
    chatwootContactId: null as number | null,
    channel: "",
    attachments: [] as ChatwootAttachment[],
    assigneeId: null as number | null,
    assigneeName: null as string | null,
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

      const body = req.body as Record<string, unknown>;

      const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : body;


      if (payload.event && payload.event !== "message_created") {
        return reply.send({ status: "ignored", reason: `Event '${payload.event}' not handled` });
      }

      // Ignorar mensagens outgoing (do bot) — Chatwoot envia ao criar mensagem via API
      const mt = payload.message_type ?? (payload as any).message?.message_type;
      const isOutgoing =
        mt === "outgoing" ||
        mt === 1 ||
        mt === "1" ||
        (typeof mt === "string" && mt.toLowerCase() === "outgoing");
      if (payload.event === "message_created" && isOutgoing) {
        return reply.send({
          status: "ignored",
          reason: "Outgoing — mensagem do bot, não processar",
        });
      }

      if (payload.event === "message_created") {
        const notIncoming = mt !== "incoming" && mt !== "0" && (mt as number) !== 0;
        if (notIncoming) {
          return reply.send({ status: "ignored", reason: "Not an incoming message" });
        }
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
      const chatwoot = parseChatwootPayload(payload);

      // Regra exclusiva do status "Teste": o agente só interage se a conversa estiver
      // atribuída ao Assignee ID configurado no front (test_assignee_id). Qualquer outra
      // conversa (outro assignee ou sem assignee) retorna 403 e não processa.
      if (agent.status !== "active") {
        if (agent.status === "test") {
          const testAssigneeId = cfg.test_assignee_id != null ? Number(cfg.test_assignee_id) : null;
          if (testAssigneeId == null) {
            return reply.status(403).send({
              error: "Agent in test mode; set 'Assignee ID para Teste' in agent config",
            });
          }
          if (chatwoot.assigneeId !== testAssigneeId) {
            return reply.status(403).send({
              error: "Agent in test mode; only the configured test assignee can interact",
            });
          }
        } else {
          return reply.status(403).send({ error: "Agent is not active" });
        }
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
            const { data: newConvId } = await supabase.rpc("find_or_create_webhook_conversation", {
              p_agent_id: agentId,
              p_channel: chatwoot.channel,
              p_external_user_id: chatwoot.externalUserId,
              p_chatwoot_conversation_id: chatwoot.chatwootConversationId,
              p_chatwoot_contact_id: chatwoot.chatwootContactId,
              p_contact_name: chatwoot.contactName,
              p_contact_avatar_url: chatwoot.contactAvatarUrl,
            });
            upsertCrmContact(supabase, agent.tenant_id, chatwoot.externalUserId, chatwoot.contactName, chatwoot.contactAvatarUrl).catch(() => {});
            if (newConvId && chatwoot.message?.trim()) {
              const likelyEcho = await isLikelyEchoOfBotMessage(supabase, agentId, newConvId, chatwoot.message, 120);
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
              await supabase.rpc("save_message", {
                p_agent_id: agentId,
                p_conversation_id: newConvId,
                p_role: "user",
                p_content: chatwoot.message,
                p_model: null,
                p_tokens_in: 0,
                p_tokens_out: 0,
                p_latency_ms: 0,
              });
            }
          } catch (e: any) {
            console.warn("[Webhook] Failed to save for human-assigned:", e.message);
          }
          return reply.send({
            status: "saved_no_ai",
            reason: `Human agent assigned: ${chatwoot.assigneeName || chatwoot.assigneeId}`,
          });
        }

        userMessage = chatwoot.message;
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

      if (chatwoot.isChatwoot && chatwoot.eventMessageId) {
        const eventKey = `${agentId}:${chatwoot.eventMessageId}`;
        if (markOrCheckProcessedEvent(eventKey)) {
          return reply.send({ status: "ignored_duplicate", reason: "Duplicate webhook event" });
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

      if (earlyConvId && userMessage) {
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
          if (earlyConvId && userMessage?.trim() && debounceMs > 0) {
            try {
              const normalizedContent = stripChatwootNamePrefix(userMessage);
              if (normalizedContent) {
                await supabase.rpc("save_message", {
                  p_agent_id: agentId,
                  p_conversation_id: earlyConvId,
                  p_role: "user",
                  p_content: normalizedContent,
                  p_model: null,
                  p_tokens_in: 0,
                  p_tokens_out: 0,
                  p_latency_ms: 0,
                });
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
          if (earlyConvId && userMessage?.trim() && debounceMs > 0) {
            try {
              const normalizedContent = stripChatwootNamePrefix(userMessage);
              if (normalizedContent) {
                await supabase.rpc("save_message", {
                  p_agent_id: agentId,
                  p_conversation_id: earlyConvId,
                  p_role: "user",
                  p_content: normalizedContent,
                  p_model: null,
                  p_tokens_in: 0,
                  p_tokens_out: 0,
                  p_latency_ms: 0,
                });
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
