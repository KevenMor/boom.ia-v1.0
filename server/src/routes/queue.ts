import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix, sanitizeLLMOutput } from "../utils/sanitize.js";
import { getFollowupPrompt } from "../services/prompts/registry.js";
import {
  sendChatwootTextMessage,
  getHumanizationConfig,
  applyJitter,
} from "../services/delivery.js";
import { shouldSkipFollowUpByContext } from "../services/followup-guard.js";
import { sendViaWaha } from "../services/waha.js";
import { transcribeAudio, isAudioAttachment } from "../services/transcribe.js";
import { buildReminderMessage } from "../utils/buildReminderMessage.js";
import { getWelcomeConversationImageMarkdown, responseAlreadyIncludesWelcomeImage } from "../utils/suite-gallery-welcome-image.js";

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
        skip_history_persist: true,
      };
      if (chatwootConvId != null) body.chatwoot_conversation_id = chatwootConvId;

      const chatResp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-nexus-auth": `Bearer ${nexusKey}`,
        },
        body: JSON.stringify(body),
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
      const MSG_SPLIT = "<<MSG_SPLIT>>";
      const responseParts: string[] = [];
      let currentPart = "";
      let capturedDebug: any[] | undefined;
      let capturedTokenUsage: Record<string, unknown> | undefined;

      const splitAssistantParts = (content: string): string[] => {
        const parts: string[] = [];
        let remainder = content;
        while (remainder.includes(MSG_SPLIT)) {
          const idx = remainder.indexOf(MSG_SPLIT);
          const part = remainder.slice(0, idx).trim();
          if (part) parts.push(part);
          remainder = remainder.slice(idx + MSG_SPLIT.length);
        }
        if (remainder.trim()) parts.push(remainder.trim());
        return parts;
      };

      const processSseLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line.startsWith("data: ")) return;
        const json = line.slice(6);
        if (!json || json === "[DONE]") return;
        try {
          const ev = JSON.parse(json);
          if (ev.conversation_id) {
            responseConvId = ev.conversation_id;
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
          if (typeof ev.repaired_assistant === "string" && ev.repaired_assistant.trim()) {
            fullContent = ev.repaired_assistant.trim();
            responseParts.length = 0;
            currentPart = "";
            const repairedParts = splitAssistantParts(fullContent);
            if (repairedParts.length > 0) {
              responseParts.push(...repairedParts);
            }
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

export async function processFollowUpItem(
  item: any,
  supabase: any,
  baseUrl: string,
  nexusKey: string
): Promise<{ processed: boolean; nextId?: string; nextDelay?: number }> {
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, provider_id, model, system_prompt, tenant_id, config, status")
    .eq("id", item.agent_id)
    .single();

  if (!agent) {
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return { processed: false };
  }

  if (agent.status === "inactive") {
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return { processed: false };
  }

  const cfg = (agent.config || {}) as Record<string, any>;

  const quietStart = Number(cfg.followup_quiet_start ?? 23);
  const quietEnd = Number(cfg.followup_quiet_end ?? 7);
  const nowBrasilia = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = nowBrasilia.getHours();
  const inQuietHours = quietStart > quietEnd
    ? (currentHour >= quietStart || currentHour < quietEnd)
    : (currentHour >= quietStart && currentHour < quietEnd);

  if (inQuietHours) {
    return { processed: false };
  }

  if (item.chatwoot_conversation_id && cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id) {
    try {
      const chatwootBase = cfg.chatwoot_url.replace(/\/+$/, "");
      const convUrl = `${chatwootBase}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}`;
      const convResp = await fetch(convUrl, {
        headers: { api_access_token: cfg.chatwoot_api_token },
        signal: AbortSignal.timeout(10_000),
      });

      if (convResp.ok) {
        const convData = await convResp.json() as { meta?: { assignee?: { id?: number } } };
        const currentAssigneeId = convData?.meta?.assignee?.id ?? null;

        if (agent.status === "test") {
          const testAssigneeId = cfg.test_assignee_id != null ? Number(cfg.test_assignee_id) : null;
          if (testAssigneeId == null || currentAssigneeId !== testAssigneeId) {
            console.log(`[FollowUp] Test mode: skipping ${item.id} (assignee ${currentAssigneeId} != test ${testAssigneeId})`);
            await supabase
              .from("follow_up_queue")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", item.id);
            return { processed: false };
          }
        }

        if (currentAssigneeId && agent.status === "active") {
          console.log(`[FollowUp] Human assigned (${currentAssigneeId}): cancelling ${item.id}`);
          await supabase
            .from("follow_up_queue")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", item.id);
          return { processed: false };
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

  const confirmedMsgs = conversationMessages.filter((m) =>
    m.role === "assistant" && /confirmad[oa]|agendad[oa]|marcad[oa]|appointment.*confirm/i.test(m.content)
  );
  if (confirmedMsgs.length > 0) {
    console.log(`[FollowUp] Appointment confirmed: cancelling ${item.id}`);
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return { processed: false };
  }

  const lastMsg = conversationMessages[conversationMessages.length - 1];
  if (lastMsg?.role === "user") {
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    return { processed: false };
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

  const guardResult = await shouldSkipFollowUpByContext(
    callChatAgent,
    baseUrl,
    nexusKey,
    item.agent_id,
    conversationMessages,
    item.conversation_id,
    item.external_user_id,
    item.chatwoot_conversation_id ?? null
  );
  if (guardResult === "skip") {
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", item.id);
    console.log(`[FollowUp] Guard SKIP for ${item.id}`);
    return { processed: false };
  }

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
    console.error("[FollowUp] LLM failed for", item.id, chatResult.error.slice(0, 200));
    return { processed: false };
  }

  const followupText = sanitizeLLMOutput(chatResult.fullContent.trim());
  if (!followupText) {
    console.warn("[FollowUp] Empty response for", item.id);
    return { processed: false };
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

  if (item.chatwoot_conversation_id && cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id) {
    const chatwootBase = cfg.chatwoot_url.replace(/\/+$/, "");
    const msgUrl = `${chatwootBase}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;
    const humanization = getHumanizationConfig(cfg);

    if (humanization.typingDelayMs > 0) {
      await new Promise((r) => setTimeout(r, applyJitter(humanization.typingDelayMs)));
    }

    const sent = await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, followupText);
    if (!sent) {
      console.error("[FollowUp] Chatwoot send failed for", item.id);
    }
  }

  await supabase
    .from("follow_up_queue")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", item.id);

  console.log(`[FollowUp] Sent attempt ${attempt}/${maxAttempts} for conversation ${item.conversation_id}`);

  if (attempt < maxAttempts) {
    const nextDelay = intervals[attempt] || intervals[intervals.length - 1] || 30;
    try {
      const { data: nextItemId } = await supabase.rpc("schedule_followup", {
        p_agent_id: item.agent_id,
        p_conversation_id: item.conversation_id,
        p_external_user_id: item.external_user_id,
        p_channel: item.channel,
        p_chatwoot_conversation_id: item.chatwoot_conversation_id,
        p_attempt: attempt + 1,
        p_max_attempts: maxAttempts,
        p_intervals_minutes: JSON.stringify(intervals),
        p_delay_minutes: nextDelay,
      });
      return { processed: true, nextId: nextItemId ?? undefined, nextDelay };
    } catch (e: any) {
      console.warn("[FollowUp] Schedule next attempt failed:", e.message);
    }
  }

  return { processed: true };
}

export async function queueRoutes(fastify: FastifyInstance) {
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

      if (process.env.NODE_ENV !== "production") {
        console.log("[ProcessQueue]", {
          agent_id,
          conversation_id: convId ?? "(null)",
          finalMessage_length: (finalMessage || "").length,
        });
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
        console.error("[ProcessQueue] callChatAgent failed:", result.error.slice(0, 300));
        return reply.status(502).send({ error: "Agent processing failed", detail: result.error });
      }

      const responseConvId = result.responseConvId ?? convId ?? null;
      const sanitizedContent = sanitizeLLMOutput(result.fullContent.trim());
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
      if (isFirstReply) {
        const { data: agentRow } = await supabase.from("agents").select("config, tenant_id").eq("id", agent_id).maybeSingle();
        const cfg = (agentRow?.config || {}) as Record<string, unknown>;
        if (cfg.welcome_video_url && typeof cfg.welcome_video_url === "string") {
          deliverBody.welcome_video_url = cfg.welcome_video_url;
        }
        const tenantId: string = typeof agentRow?.tenant_id === "string" ? agentRow.tenant_id : "";
        if (tenantId) {
          const welcomeImageMd = await getWelcomeConversationImageMarkdown(supabase, tenantId);
          if (welcomeImageMd) {
            const responseText =
              typeof deliverBody.response_text === "string" ? deliverBody.response_text : "";
            const parts = deliverBody.response_parts as string[] | undefined;
            const partsHaveWelcome =
              Array.isArray(parts) &&
              parts.some(
                (p) => typeof p === "string" && responseAlreadyIncludesWelcomeImage(p, welcomeImageMd)
              );
            if (!responseAlreadyIncludesWelcomeImage(responseText, welcomeImageMd) && !partsHaveWelcome) {
              if (Array.isArray(parts) && parts.length > 0) {
                deliverBody.response_parts = [welcomeImageMd, ...parts];
              } else {
                deliverBody.response_parts = [
                  welcomeImageMd,
                  ...(responseText ? [responseText] : []),
                ];
              }
              deliverBody.response_text = welcomeImageMd + responseText;
            }
          }
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

  /** Lista para o painel Follow-ups (filtra por tenant via agentes). */
  fastify.get(
    "/queue/followups/list",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const tenantId =
        typeof req.query?.tenant_id === "string" ? req.query.tenant_id.trim() : "";
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id is required" });
      }

      const supabase = createNexusClient();

      const { data: agents, error: agentsErr } = await supabase
        .from("agents")
        .select("id, name")
        .eq("tenant_id", tenantId);

      if (agentsErr) {
        console.error("[FollowUp list] agents:", agentsErr.message);
        return reply.status(500).send({ error: agentsErr.message });
      }

      const agentRows = (agents ?? []) as { id: string; name: string | null }[];
      const agentIds = agentRows.map((a) => a.id);
      const nameById = new Map(agentRows.map((a) => [a.id, a.name]));

      if (agentIds.length === 0) {
        return reply.send([]);
      }

      const { data: rows, error: queueErr } = await supabase
        .from("follow_up_queue")
        .select(
          "id, agent_id, conversation_id, external_user_id, channel, chatwoot_conversation_id, attempt, max_attempts, scheduled_at, status, cancel_reason, created_at, updated_at"
        )
        .in("agent_id", agentIds)
        .order("scheduled_at", { ascending: false })
        .limit(1000);

      if (queueErr) {
        console.error("[FollowUp list] queue:", queueErr.message);
        return reply.status(500).send({ error: queueErr.message });
      }

      const list = (rows ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        agent_name: nameById.get(String(r.agent_id)) ?? null,
      }));

      return reply.send(list);
    }
  );

  /** Lista de lembretes de agenda por tenant (painel Follow-ups). */
  fastify.get(
    "/queue/reminders/list",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const tenantId =
        typeof req.query?.tenant_id === "string" ? req.query.tenant_id.trim() : "";
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id is required" });
      }

      const supabase = createNexusClient();

      const { data: agents } = await supabase
        .from("agents")
        .select("id, name")
        .eq("tenant_id", tenantId);
      const agentRows = (agents ?? []) as { id: string; name: string | null }[];
      const nameById = new Map(agentRows.map((a) => [a.id, a.name]));

      const { data: rows, error } = await supabase
        .from("appointment_reminders")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("remind_at", { ascending: false })
        .limit(1000);

      if (error) {
        console.error("[Reminders list]:", error.message);
        return reply.status(500).send({ error: error.message });
      }

      const list = (rows ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        agent_name: nameById.get(String(r.agent_id)) ?? null,
      }));

      return reply.send(list);
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
      console.error("[FollowUp] Failed to fetch pending:", fetchErr.message);
      return reply.status(500).send({ error: fetchErr.message });
    }

    if (!pending || pending.length === 0) {
      return reply.send({ processed: 0 });
    }

    let processed = 0;

    for (const item of pending) {
      try {
        const result = await processFollowUpItem(item, supabase, baseUrl, nexusKey);
        if (result.processed) {
          processed++;
        }
      } catch (e: any) {
        console.error("[FollowUp] Error processing item", item.id, e.message);
      }
    }

    return reply.send({ processed, total: pending.length });
  });

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
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
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
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      const cfg = (agent.config || {}) as Record<string, unknown>;
      if (!cfg.reminder_enabled) {
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
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
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
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
        sent = await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token as string, message);
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
          .update({ status: "failed", updated_at: new Date().toISOString() })
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
