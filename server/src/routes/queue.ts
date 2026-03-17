import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix, sanitizeLLMOutput } from "../utils/sanitize.js";
import { msgLog, followupLog } from "../utils/flow-logger.js";
import { getFollowupPrompt } from "../services/prompts/registry.js";
import {
  getChatwootAuthHeaders,
  sendChatwootTextMessage,
  getHumanizationConfig,
  applyJitter,
} from "../services/delivery.js";
import { sendViaWaha } from "../services/waha.js";
import { transcribeAudio, isAudioAttachment } from "../services/transcribe.js";
import { buildReminderMessage } from "../utils/buildReminderMessage.js";
import {
  getBrasiliaHour,
  isInQuietHours,
  getNextSlotOutsideQuietHours,
} from "../utils/brasiliaTime.js";

const API_BASE = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

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
  const { data: pending } = await supabase
    .from("webhook_message_buffer")
    .select("id, content, created_at")
    .eq("agent_id", agentId)
    .eq("external_user_id", externalUserId)
    .eq("channel", channel)
    .eq("processed", false)
    .order("created_at", { ascending: true });

  if (!pending || pending.length === 0) return [];

  const ids = pending.map((m: any) => m.id);
  await supabase.from("webhook_message_buffer").delete().in("id", ids);
  return pending.map((m: any) => m.content as string);
}

async function callChatAgent(
  baseUrl: string,
  nexusKey: string,
  agentId: string,
  messages: { role: string; content: string }[],
  convId: string | null,
  attachments?: any[],
  externalUserId?: string | null,
  chatwootConvId?: number | null
): Promise<{
  error: string | null;
  fullContent: string;
  responseParts: string[];
  responseConvId: string | null;
  handoffAssigneeId?: number | null;
  debug?: any[];
  token_usage?: Record<string, unknown>;
}> {
  const chatUrl = `${baseUrl}/api/chat-local`;
  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: Record<string, unknown> = {
        agent_id: agentId,
        messages,
        conversation_id: convId,
        attachments,
        external_user_id: externalUserId,
        skip_save: true,
      };
      if (chatwootConvId != null) body.chatwoot_conversation_id = chatwootConvId;

      const chatResp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-nexus-auth": `Bearer ${nexusKey}`,
          "x-skip-save": "true",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(115_000),
      });

      if (!chatResp.ok) {
        const errText = await chatResp.text();
        const isRetryable =
          chatResp.status >= 500 ||
          chatResp.status === 404 ||
          /dns error|ECONNREFUSED|timeout|name resolution/i.test(errText);

        if (!isRetryable || attempt === MAX_RETRIES) {
          return {
            error: errText,
            fullContent: "",
            responseParts: [],
            responseConvId: convId,
          };
        }
        lastError = errText;
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }

      const reader = chatResp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullContent = "";
      let responseConvId = convId;
      let handoffAssigneeId: number | null = null;
      const MSG_SPLIT = "<<MSG_SPLIT>>";
      const responseParts: string[] = [];
      let currentPart = "";
      let capturedDebug: any[] | undefined;
      let capturedTokenUsage: Record<string, unknown> | undefined;

      const processSseLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) return;
        const json = line.slice(6);
        if (!json || json === "[DONE]") return;
        try {
          const ev = JSON.parse(json);
          if (ev.conversation_id) {
            responseConvId = ev.conversation_id;
            if (ev.handoff_assignee_id != null) handoffAssigneeId = Number(ev.handoff_assignee_id);
            return;
          }
          if (ev.debug) {
            capturedDebug = Array.isArray(ev.debug) ? ev.debug : [ev.debug];
            return;
          }
          if (ev.token_usage) {
            capturedTokenUsage = ev.token_usage as Record<string, unknown>;
            return;
          }
          const delta = ev.choices?.[0]?.delta?.content;
          if (!delta) return;
          currentPart += delta;
          fullContent += delta;
          while (currentPart.includes(MSG_SPLIT)) {
            const idx = currentPart.indexOf(MSG_SPLIT);
            const part = currentPart.slice(0, idx).trim();
            if (part) responseParts.push(part);
            currentPart = currentPart.slice(idx + MSG_SPLIT.length);
          }
        } catch {
          /* skip */
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buf += decoder.decode(value || new Uint8Array(), { stream: !done });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          processSseLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
        }
        if (done) break;
      }
      if (currentPart.trim()) responseParts.push(currentPart.trim());

      return {
        error: null,
        fullContent,
        responseParts,
        responseConvId,
        handoffAssigneeId,
        debug: capturedDebug,
        token_usage: capturedTokenUsage,
      };
    } catch (fetchErr: any) {
      lastError = fetchErr?.message || "fetch error";
      const isRetryable = /dns|ECONNREFUSED|timeout|name resolution|connection/i.test(lastError);
      if (!isRetryable || attempt === MAX_RETRIES) {
        return {
          error: lastError,
          fullContent: "",
          responseParts: [],
          responseConvId: convId,
        };
      }
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }

  return {
    error: lastError || "max retries exceeded",
    fullContent: "",
    responseParts: [],
    responseConvId: convId,
  };
}

async function fireDeliverMessage(
  baseUrl: string,
  authKey: string,
  body: Record<string, unknown>
): Promise<void> {
  const deliverUrl = `${baseUrl}/api/delivery/send`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(deliverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (resp.status >= 200 && resp.status < 300) {
        return;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
    } catch (e: any) {
      if (e.name === "AbortError") return;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function queueRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/queue/followups/list",
    async (
      req: FastifyRequest<{ Querystring: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      const tenantId = req.query.tenant_id;
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id is required" });
      }
      const supabase = createNexusClient();
      const { data: agents, error: agentsErr } = await supabase
        .from("agents")
        .select("id")
        .eq("tenant_id", tenantId);
      if (agentsErr) {
        return reply.status(500).send({ error: agentsErr.message });
      }
      const agentIds = (agents ?? []).map((a: { id: string }) => a.id);
      if (agentIds.length === 0) {
        return reply.send([]);
      }
      const { data: rows, error: listErr } = await supabase
        .from("follow_up_queue")
        .select("id, agent_id, conversation_id, external_user_id, channel, chatwoot_conversation_id, attempt, max_attempts, scheduled_at, status, cancel_reason, created_at, updated_at, agents(id, name)")
        .in("agent_id", agentIds)
        .order("scheduled_at", { ascending: true })
        .limit(500);
      if (listErr) {
        return reply.status(500).send({ error: listErr.message });
      }
      const list = (rows ?? []).map((r: any) => ({
        ...r,
        agent_name: r.agents?.name ?? null,
        cancel_reason: r.cancel_reason ?? null,
        agents: undefined,
      }));
      return reply.send(list);
    }
  );

  fastify.post(
    "/queue/process",
    async (
      req: FastifyRequest<{
        Body: {
          agent_id: string;
          conversation_id?: string;
          external_user_id?: string;
          channel?: string;
          chatwoot_conversation_id?: number;
          chatwoot_contact_id?: number;
          contact_name?: string;
          contact_avatar_url?: string;
          user_message?: string;
          debounce_ms?: number;
          buffer_created_at?: string;
          attachments?: any[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({ error: "Missing server config" });
      }
      const authKey = nexusKey as string;

      const supabase = createNexusClient();
      const baseUrl = API_BASE.replace(/\/+$/, "").replace(/\/api$/, "") || `http://localhost:${process.env.PORT || 3001}`;

      const {
        agent_id,
        conversation_id,
        external_user_id,
        channel,
        chatwoot_conversation_id,
        chatwoot_contact_id,
        contact_name,
        contact_avatar_url,
        user_message,
        debounce_ms = 0,
        buffer_created_at,
        attachments,
      } = req.body;

      let finalMessage = user_message;

      if (debounce_ms > 0) {
        await new Promise((r) => setTimeout(r, debounce_ms));
        if (buffer_created_at) {
          const imLast = await isLastMessage(supabase, agent_id, external_user_id || "", channel || "", buffer_created_at);
          if (!imLast) {
            return reply.send({ status: "skipped", reason: "newer message arrived" });
          }
        }
        const allMessages = await consumeBufferedMessages(supabase, agent_id, external_user_id || "", channel || "");
        if (allMessages.length > 0) {
          finalMessage = allMessages.join("\n");
        }
      }

      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
      if (!finalMessage && !hasAttachments) {
        return reply.status(400).send({ error: "No message to process" });
      }

      if (hasAttachments) {
        const audioAttachments = (attachments as any[]).filter(isAudioAttachment);
        if (audioAttachments.length > 0) {
          console.log("[ProcessQueue] Transcribing", audioAttachments.length, "audio attachment(s)...");
          const transcriptions = await Promise.all(
            audioAttachments.map((a: any) => transcribeAudio(a.data_url))
          );
          const transcribedTexts = transcriptions
            .filter((t) => t.text)
            .map((t) => t.text);
          if (transcribedTexts.length > 0) {
            const audioText = transcribedTexts.join("\n");
            console.log("[ProcessQueue] Transcription result:", audioText.slice(0, 120));
            finalMessage = finalMessage
              ? `${finalMessage}\n[Áudio transcrito]: ${audioText}`
              : `[Áudio transcrito]: ${audioText}`;
          } else {
            const errors = transcriptions.filter((t) => t.error).map((t) => t.error);
            console.warn("[ProcessQueue] Audio transcription failed:", errors);
            if (!finalMessage) {
              finalMessage = "[O cliente enviou um áudio que não pôde ser transcrito. Peça para repetir por texto.]";
            }
          }
        }
      }

      if (!finalMessage && hasAttachments) {
        finalMessage = "";
      }

      finalMessage = stripChatwootNamePrefix(finalMessage || "");

      let convId = conversation_id;

      if (!convId) {
        try {
          const { data } = await supabase.rpc("find_or_create_webhook_conversation", {
            p_agent_id: agent_id,
            p_channel: channel,
            p_external_user_id: external_user_id,
            p_chatwoot_conversation_id: chatwoot_conversation_id,
            p_chatwoot_contact_id: chatwoot_contact_id,
            p_contact_name: contact_name,
            p_contact_avatar_url: contact_avatar_url,
          });
          convId = data;
        } catch (e: any) {
          console.warn("[ProcessQueue] find_or_create failed:", e.message);
        }
      }

      if (!convId) {
        try {
          const { data } = await supabase.rpc("create_conversation", {
            p_agent_id: agent_id,
            p_channel: channel,
            p_external_user_id: external_user_id,
            p_contact_name: contact_name,
            p_contact_avatar_url: contact_avatar_url,
          });
          convId = data;
        } catch (e: any) {
          console.error("[ProcessQueue] create_conversation failed:", e.message);
        }
      }

      if (convId && (contact_name || contact_avatar_url)) {
        try {
          await supabase.rpc("update_conversation_contact", {
            p_agent_id: agent_id,
            p_conversation_id: convId,
            p_contact_name: contact_name,
            p_contact_avatar_url: contact_avatar_url,
          });
        } catch (e: any) {
          console.warn("[ProcessQueue] update_contact failed:", e.message);
        }
      }

      let conversationMessages: { role: string; content: string }[] = [];
      if (convId) {
        try {
          const { data: history } = await supabase.rpc("load_conversation_messages", {
            p_agent_id: agent_id,
            p_conversation_id: convId,
          });
          if (history && Array.isArray(history)) {
            conversationMessages = history.slice(-20).map((m: any) => ({
              role: m.role === "tool" ? "system" : m.role,
              content: (m.content as string) || "",
            }));
          }
        } catch (e) {
          console.warn("[ProcessQueue] Could not load history:", e);
        }
      }

      const lastMsg = conversationMessages[conversationMessages.length - 1];
      const lastIsSameUserMessage =
        lastMsg?.role === "user" && lastMsg?.content === (finalMessage || "").trim();
      const messages = lastIsSameUserMessage
        ? conversationMessages
        : [...conversationMessages, { role: "user", content: finalMessage }];

      if (convId && !lastIsSameUserMessage) {
        try {
          await supabase.rpc("save_message", {
            p_agent_id: agent_id,
            p_conversation_id: convId,
            p_role: "user",
            p_content: finalMessage,
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
          });
        } catch (e: any) {
          console.warn("[ProcessQueue] save user message failed:", e?.message);
        }
      }

      const result = await callChatAgent(
        baseUrl,
        authKey,
        agent_id,
        messages,
        convId ?? null,
        attachments,
        external_user_id ?? null,
        chatwoot_conversation_id ?? null
      );

      if (result.error) {
        msgLog.queueChatFailed(agent_id, result.error);
        return reply.status(502).send({ error: "Agent processing failed", detail: result.error });
      }

      msgLog.queueChatOk(agent_id, convId);

      const responseConvId = result.responseConvId ?? convId ?? null;
      const rawContent = result.fullContent?.trim() || "";
      const sanitizedContent = rawContent
        ? sanitizeLLMOutput(rawContent)
        : "Desculpe, tive um problema ao processar. Pode repetir, por favor?";
      if (!rawContent) {
        msgLog.queueContentEmpty(agent_id);
      }
      const hasMetadata = result.debug?.length || result.token_usage;
      const messageMetadata =
        hasMetadata
          ? {
              ...(result.debug?.length ? { debug: result.debug } : {}),
              ...(result.token_usage ? { token_usage: result.token_usage } : {}),
            }
          : null;

      if (responseConvId && sanitizedContent) {
        try {
          const savePayload: Record<string, unknown> = {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
            p_role: "assistant",
            p_content: sanitizedContent,
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
          };
          if (messageMetadata) savePayload.p_metadata = messageMetadata;
          await supabase.rpc("save_message", savePayload);
        } catch (e: any) {
          console.warn("[ProcessQueue] save assistant message failed:", e?.message);
        }
      }

      const responseParts =
        result.responseParts.length > 0
          ? result.responseParts.map((p) => sanitizeLLMOutput(p.trim())).filter(Boolean)
          : sanitizedContent
            ? [sanitizedContent]
            : [];

      const isFirstReply = conversationMessages.filter((m) => m.role === "assistant").length === 0;
      const deliverBody: Record<string, unknown> = {
        agent_id,
        conversation_id: responseConvId,
        external_user_id,
        channel,
        chatwoot_conversation_id,
        response_text: sanitizedContent,
        response_parts: responseParts,
      };
      if (result.handoffAssigneeId != null) {
        deliverBody.assignee_id = result.handoffAssigneeId;
      }
      if (isFirstReply) {
        const { data: agentRow } = await supabase.from("agents").select("config").eq("id", agent_id).maybeSingle();
        const cfg = (agentRow?.config || {}) as Record<string, unknown>;
        if (cfg.welcome_video_url && typeof cfg.welcome_video_url === "string") {
          deliverBody.welcome_video_url = cfg.welcome_video_url;
        }
      }

      fireDeliverMessage(baseUrl, authKey, deliverBody).catch((e) =>
        console.error("[ProcessQueue] deliver-message failed:", e)
      );

      return reply.send({
        status: "processed",
        conversation_id: result.responseConvId,
        parts: responseParts.length,
      });
    }
  );

  fastify.post("/queue/followups", async (_req: FastifyRequest, reply: FastifyReply) => {
    const supabase = createNexusClient();
    const baseUrl = API_BASE.replace(/\/+$/, "").replace(/\/api$/, "") || `http://localhost:${process.env.PORT || 3001}`;
    const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

    if (!nexusKey) {
      return reply.status(500).send({ error: "Missing server config" });
    }

    const { data: pending, error: fetchErr } = await supabase
      .from("follow_up_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (fetchErr) {
      followupLog.fetchFailed(fetchErr.message);
      return reply.status(500).send({ error: fetchErr.message });
    }

    if (!pending || pending.length === 0) {
      followupLog.cronNoPending();
      return reply.send({ processed: 0, total: 0 });
    }

    followupLog.cronStart(pending.length);

    let processed = 0;
    let skipped = 0;

    for (const item of pending) {
      try {
        const { data: agent } = await supabase
          .from("agents")
          .select("id, name, provider_id, model, system_prompt, tenant_id, config, status")
          .eq("id", item.agent_id)
          .single();

        if (!agent) {
          followupLog.cancelled(item.id, "agent_not_found", `agent_id=${item.agent_id}`);
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "agent_not_found", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        if (agent.status === "inactive") {
          followupLog.cancelled(item.id, "agent_inactive");
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "agent_inactive", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        const cfg = (agent.config || {}) as Record<string, any>;

        /** Extrai hora (0-23) de "HH:mm" ou número. O painel salva "07:00", "08:00" etc. */
        function parseHour(v: any, defaultVal: number): number {
          if (v == null || v === "") return defaultVal;
          const n = Number(v);
          if (!Number.isNaN(n) && n >= 0 && n <= 23) return n;
          const s = String(v);
          const m = s.match(/^(\d{1,2})/);
          if (m) {
            const h = parseInt(m[1], 10);
            if (!Number.isNaN(h)) return Math.min(23, Math.max(0, h));
          }
          return defaultVal;
        }

        const quietStart = parseHour(cfg.followup_quiet_start, 23);
        const quietEnd = parseHour(cfg.followup_quiet_end, 7);
        const now = new Date();
        const currentHour = getBrasiliaHour(now);
        const inQuietHours = isInQuietHours(quietStart, quietEnd, now);

        if (inQuietHours) {
          const nextSlot = getNextSlotOutsideQuietHours(quietStart, quietEnd, item.scheduled_at, now);
          followupLog.rescheduled(item.id, `quiet_hours ${currentHour}h`);
          await supabase
            .from("follow_up_queue")
            .update({ scheduled_at: nextSlot, updated_at: now.toISOString() })
            .eq("id", item.id);
          skipped++;
          continue;
        }

        // --- CENÁRIO 2 e 3: Verificar assignee atual no Chatwoot ---
        if (item.chatwoot_conversation_id && cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id) {
          try {
            const chatwootBase = cfg.chatwoot_url.replace(/\/+$/, "");
            const convUrl = `${chatwootBase}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}`;
            const cwAuth = getChatwootAuthHeaders(cfg.chatwoot_api_token, cfg);
            const convResp = await fetch(convUrl, {
              headers: cwAuth,
              signal: AbortSignal.timeout(10_000),
            });

            if (convResp.ok) {
              const raw = await convResp.json() as Record<string, unknown>;
              // Chatwoot pode retornar direto ou em payload; assignee em meta ou na raiz
              const convData = (raw.payload as Record<string, unknown>) || raw;
              const meta = (convData.meta || convData) as Record<string, unknown>;
              const assignee = (meta.assignee || (convData as any).assignee) as { id?: number | string } | null;
              const currentAssigneeId = assignee?.id != null ? Number(assignee.id) : null;

              // CENÁRIO 3: Agente em teste — só enviar follow-up se assignee = test_assignee_id
              if (agent.status === "test") {
                const testAssigneeId = cfg.test_assignee_id != null ? Number(cfg.test_assignee_id) : null;
                if (testAssigneeId == null || currentAssigneeId !== testAssigneeId) {
                  followupLog.cancelled(item.id, "test_assignee_mismatch");
                  await supabase
                    .from("follow_up_queue")
                    .update({ status: "cancelled", cancel_reason: "test_assignee_mismatch", updated_at: new Date().toISOString() })
                    .eq("id", item.id);
                  continue;
                }
              }

              // CENÁRIO 2: Só cancelar quando agent_assignee_id está configurado E assignee ≠ bot (humano assumiu).
              // Se agent_assignee_id NÃO está configurado, não cancelar por assignee — enviar follow-up.
              if (currentAssigneeId != null && agent.status === "active") {
                const agentAssigneeId = cfg.agent_assignee_id != null && cfg.agent_assignee_id !== "" ? Number(cfg.agent_assignee_id) : null;
                if (agentAssigneeId != null) {
                  const isAgentOwnConversation = Number(currentAssigneeId) === Number(agentAssigneeId);
                  if (!isAgentOwnConversation) {
                    followupLog.cancelled(item.id, "human_assigned", `assignee=${currentAssigneeId}`);
                    await supabase
                      .from("follow_up_queue")
                      .update({ status: "cancelled", cancel_reason: "human_assigned", updated_at: new Date().toISOString() })
                      .eq("id", item.id);
                    continue;
                  }
                }
              }
            }
          } catch (e: any) {
            console.warn("[FollowUp] Chatwoot assignee check failed:", e.message);
          }
        }

        const { data: tenant } = await supabase
          .from("tenants")
          .select("slug")
          .eq("id", agent.tenant_id)
          .single();

        const tenantSlug = tenant?.slug ?? null;

        let conversationMessages: { role: string; content: string }[] = [];
        if (item.conversation_id) {
          try {
            const { data: history } = await supabase.rpc("load_conversation_messages", {
              p_agent_id: item.agent_id,
              p_conversation_id: item.conversation_id,
            });
            if (history && Array.isArray(history)) {
              conversationMessages = history.slice(-20).map((m: any) => ({
                role: m.role === "tool" ? "system" : m.role,
                content: (m.content as string) || "",
              }));
            }
          } catch (e: any) {
            console.warn("[FollowUp] Could not load history:", e.message);
          }
        }

        // --- CENÁRIO 1: Verificar se houve agendamento confirmado ---
        const confirmedMsgs = conversationMessages.filter((m) =>
          m.role === "assistant" && /confirmad[oa]|agendad[oa]|marcad[oa]|appointment.*confirm/i.test(m.content)
        );
        const hasConfirmedSchedule = confirmedMsgs.length > 0;

        if (hasConfirmedSchedule) {
          followupLog.cancelled(item.id, "appointment_confirmed");
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "appointment_confirmed", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        // --- CENÁRIO 1b: Cliente deixou claro que NÃO tem mais interesse (ex.: disse "Não" a oferta de opções parecidas) ---
        const userDeclinedNoInterest = (() => {
          const declinePattern = /^(n[aã]o|nao|nope|dispenso|t[aá] bom|j[aá] encontrei|desisti|n[aã]o quero|n[aã]o preciso|n[aã]o obrigad[oa]|deixa (pra )?lá|sem interesse|obrigad[oa]?\s*[,.]?\s*(mas\s+)?n[aã]o|n[aã]o\s+obrigad[oa])[\s.!?]*$/i;
          const recent = conversationMessages.slice(-10);
          for (let i = recent.length - 1; i >= 0; i--) {
            if (recent[i].role === "user") {
              const content = (recent[i].content || "").trim();
              if (declinePattern.test(content) || (content.length <= 25 && /^n[aã]o\b/i.test(content))) {
                return true;
              }
              break;
            }
          }
          return false;
        })();
        if (userDeclinedNoInterest) {
          followupLog.cancelled(item.id, "client_no_interest");
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "client_no_interest", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        const lastMsg = conversationMessages[conversationMessages.length - 1];
        if (lastMsg?.role === "assistant") {
          // No reply from user since our last message — proceed with follow-up
        } else if (!lastMsg || (lastMsg.role !== "user" && lastMsg.role !== "assistant")) {
          followupLog.cancelled(item.id, "unknown_state", `lastMsg=${lastMsg?.role ?? "null"}`);
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "unknown_state", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        } else if (lastMsg?.role === "user") {
          followupLog.cancelled(item.id, "user_replied");
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "user_replied", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        const attempt = item.attempt || 1;
        const maxAttempts = item.max_attempts || 3;
        const intervals: number[] = (() => {
          try {
            const raw = item.intervals_minutes;
            return Array.isArray(raw) ? raw : JSON.parse(raw);
          } catch {
            return [10, 20, 30];
          }
        })();

        let followupPrompt = getFollowupPrompt(tenantSlug);
        if (!followupPrompt) {
          followupPrompt = `[SISTEMA INTERNO - FOLLOW-UP]\nEscreva uma mensagem curta de follow-up (tentativa {attempt} de {max_attempts}). Seja natural, breve (1-2 frases) e use o contexto da conversa.`;
        }
        followupPrompt = followupPrompt
          .replace(/\{attempt\}/g, String(attempt))
          .replace(/\{max_attempts\}/g, String(maxAttempts));

        const messages = [
          ...conversationMessages,
          { role: "user", content: followupPrompt },
        ];

        const chatResult = await callChatAgent(
          baseUrl,
          nexusKey,
          item.agent_id,
          messages,
          item.conversation_id,
          undefined,
          item.external_user_id,
          item.chatwoot_conversation_id ?? null
        );

        if (chatResult.error) {
          followupLog.error(item.id, item.conversation_id, attempt, maxAttempts, "llm_failed");
          continue;
        }

        const followupText = sanitizeLLMOutput(chatResult.fullContent.trim());
        if (!followupText) {
          followupLog.error(item.id, item.conversation_id, attempt, maxAttempts, "empty_response");
          continue;
        }

        if (item.conversation_id) {
          try {
            await supabase.rpc("save_message", {
              p_agent_id: item.agent_id,
              p_conversation_id: item.conversation_id,
              p_role: "assistant",
              p_content: followupText,
              p_model: "followup",
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: null,
            });
          } catch (e: any) {
            console.warn("[FollowUp] Save message failed:", e.message);
          }
        }

        // Re-verificar status antes de enviar (evita race: webhook pode ter cancelado enquanto processávamos)
        const { data: recheck } = await supabase
          .from("follow_up_queue")
          .select("status")
          .eq("id", item.id)
          .single();
        if (recheck?.status !== "pending") {
          followupLog.cancelled(item.id, "skipped_race", `status=${recheck?.status ?? "?"} (cancelado durante processamento)`);
          continue;
        }

        let sent = false;
        if (item.chatwoot_conversation_id && cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id) {
          const chatwootBase = cfg.chatwoot_url.replace(/\/+$/, "");
          const msgUrl = `${chatwootBase}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;
          const humanization = getHumanizationConfig(cfg);
          const cwAuth = getChatwootAuthHeaders(cfg.chatwoot_api_token, cfg);

          if (humanization.typingDelayMs > 0) {
            await new Promise((r) => setTimeout(r, applyJitter(humanization.typingDelayMs)));
          }

          sent = await sendChatwootTextMessage(msgUrl, cwAuth, followupText);
          if (!sent) {
            followupLog.error(item.id, item.conversation_id, attempt, maxAttempts, "chatwoot_send_failed");
          }
        } else {
          followupLog.cancelled(item.id, "no_delivery_channel");
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", cancel_reason: "no_delivery_channel", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          continue;
        }

        if (!sent) {
          continue;
        }

        await supabase
          .from("follow_up_queue")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", item.id);

        if (attempt < maxAttempts) {
          const nextDelay = intervals[attempt] || intervals[intervals.length - 1] || 30;
          try {
            await supabase.rpc("schedule_followup", {
              p_agent_id: item.agent_id,
              p_conversation_id: item.conversation_id,
              p_external_user_id: item.external_user_id,
              p_channel: item.channel,
              p_chatwoot_conversation_id: item.chatwoot_conversation_id,
              p_attempt: attempt + 1,
              p_max_attempts: maxAttempts,
              p_intervals_minutes: intervals,
              p_delay_minutes: nextDelay,
            });
            followupLog.nextScheduled(item.conversation_id, attempt + 1, maxAttempts, nextDelay);
          } catch (e: any) {
            console.warn("[FollowUp] Schedule next attempt failed:", e.message);
          }
        }

        processed++;
        followupLog.sent(item.id, item.conversation_id, attempt, maxAttempts);
      } catch (e: any) {
        followupLog.error(item.id, item.conversation_id, item.attempt || 1, item.max_attempts || 3, (e as Error)?.message || "unknown");
      }
    }

    return reply.send({ processed, skipped, total: pending.length });
  });

  fastify.get(
    "/queue/reminders/list",
    async (
      req: FastifyRequest<{ Querystring: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      const tenantId = req.query.tenant_id;
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id is required" });
      }
      const supabase = createNexusClient();
      const { data: rows, error: listErr } = await supabase
        .from("appointment_reminders")
        .select("id, agent_id, tenant_id, calendar_event_id, conversation_id, external_user_id, chatwoot_conversation_id, event_title, event_start_at, remind_at, status, skip_reason, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("remind_at", { ascending: false })
        .limit(500);
      if (listErr) {
        return reply.status(500).send({ error: listErr.message });
      }
      const agentIds = [...new Set((rows ?? []).map((r: { agent_id: string }) => r.agent_id))];
      const agentMap = new Map<string, string>();
      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from("agents")
          .select("id, name")
          .in("id", agentIds);
        for (const a of agents ?? []) {
          agentMap.set(a.id, a.name ?? "");
        }
      }
      const list = (rows ?? []).map((r: any) => ({
        ...r,
        agent_name: agentMap.get(r.agent_id) ?? null,
      }));
      return reply.send(list);
    }
  );

  fastify.post("/queue/reminders", async (_req: FastifyRequest, reply: FastifyReply) => {
    const supabase = createNexusClient();

    const { data: pendingItems, error: fetchErr } = await supabase
      .from("appointment_reminders")
      .select("*")
      .eq("status", "pending")
      .lte("remind_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchErr) {
      console.error("[Reminder] Fetch error:", fetchErr.message);
      return reply.status(500).send({ error: fetchErr.message });
    }

    if (!pendingItems || pendingItems.length === 0) {
      return reply.send({ processed: 0, skipped: 0, failed: 0, message: "No pending reminders" });
    }

    const seen = new Map<string, (typeof pendingItems)[0]>();
    const duplicateIds: string[] = [];
    for (const item of pendingItems) {
      if (seen.has(item.calendar_event_id)) {
        duplicateIds.push(item.id);
      } else {
        seen.set(item.calendar_event_id, item);
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`[Reminder] Cancelling ${duplicateIds.length} duplicate reminder(s)`);
      await supabase
        .from("appointment_reminders")
        .update({ status: "cancelled", skip_reason: "duplicate", updated_at: new Date().toISOString() })
        .in("id", duplicateIds);
    }

    const uniqueItems = Array.from(seen.values());
    console.log(`[Reminder] Processing ${uniqueItems.length} unique reminder(s) (${duplicateIds.length} duplicates cancelled)`);

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    const defaultTemplate = "Olá! 😊 Passando para lembrar do seu agendamento de {titulo} hoje às {horario}. Te esperamos! 🙌";

    for (const item of uniqueItems) {
      const { data: agent } = await supabase
        .from("agents")
        .select("id, name, config, status")
        .eq("id", item.agent_id)
        .single();

      if (!agent || (agent.status !== "active" && agent.status !== "test")) {
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", skip_reason: "agent_inactive", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      const cfg = (agent.config || {}) as Record<string, unknown>;
      if (!cfg.reminder_enabled) {
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", skip_reason: "reminder_disabled", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
      const hasWaha = !!(cfg.waha_url && cfg.waha_session);

      if (!hasChatwoot && !hasWaha) {
        console.warn(`[Reminder] No delivery channel for agent ${agent.id}, cancelling`);
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", skip_reason: "no_delivery_channel", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      // Quiet hours: reagendar remind_at em vez de cancelar (mesma lógica do follow-up)
      function parseReminderHour(v: unknown, defaultVal: number): number {
        if (v == null || v === "") return defaultVal;
        const n = Number(v);
        if (!Number.isNaN(n) && n >= 0 && n <= 23) return n;
        const s = String(v);
        const m = s.match(/^(\d{1,2})/);
        if (m) {
          const h = parseInt(m[1], 10);
          if (!Number.isNaN(h)) return Math.min(23, Math.max(0, h));
        }
        return defaultVal;
      }
      const rQuietStart = parseReminderHour(cfg.followup_quiet_start, 23);
      const rQuietEnd = parseReminderHour(cfg.followup_quiet_end, 7);
      const now = new Date();
      if (isInQuietHours(rQuietStart, rQuietEnd, now)) {
        const nextSlot = getNextSlotOutsideQuietHours(rQuietStart, rQuietEnd, item.remind_at, now);
        console.log(`[Reminder] REAGENDANDO item ${item.id}: quiet hours — hora Brasília ${getBrasiliaHour(now)}h → próximo slot ${nextSlot}`);
        await supabase
          .from("appointment_reminders")
          .update({ remind_at: nextSlot, updated_at: now.toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      const template = (cfg.reminder_template as string) || defaultTemplate;
      const message = buildReminderMessage(template, item.event_title, item.event_start_at);

      let sent = false;

      if (hasChatwoot && item.chatwoot_conversation_id) {
        const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
        const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;
        const cwAuth = getChatwootAuthHeaders(cfg.chatwoot_api_token as string, cfg);
        sent = await sendChatwootTextMessage(msgUrl, cwAuth, message);
      }

      if (!sent && hasWaha && item.external_user_id) {
        const wahaResult = await sendViaWaha(
          cfg.waha_url as string,
          (cfg.waha_api_key as string) || "",
          (cfg.waha_session as string) || "default",
          item.external_user_id,
          message
        );
        sent = wahaResult.ok;
      }

      if (sent) {
        console.log(`[Reminder] Sent reminder for event "${item.event_title}" at ${item.event_start_at}`);

        await supabase
          .from("appointment_reminders")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", item.id);

        if (!item.conversation_id.startsWith("manual-")) {
          try {
            await supabase.rpc("save_message", {
              p_agent_id: agent.id,
              p_conversation_id: item.conversation_id,
              p_role: "assistant",
              p_content: message,
              p_model: "reminder",
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: 0,
            });
          } catch (e) {
            console.warn("[Reminder] Could not save to history:", (e as Error)?.message);
          }
        }

        processed++;
      } else {
        console.error(`[Reminder] Failed to send for event "${item.event_title}", marking as failed`);
        await supabase
          .from("appointment_reminders")
          .update({ status: "failed", skip_reason: "send_failed", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        failed++;
      }
    }

    return reply.send({
      processed,
      skipped,
      failed,
      duplicatesCancelled: duplicateIds.length,
      total: uniqueItems.length,
    });
  });
}
