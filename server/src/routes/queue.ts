import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { stripChatwootNamePrefix, sanitizeLLMOutput } from "../utils/sanitize.js";

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
  chatwootConversationId?: number | null
): Promise<{ error: string | null; fullContent: string; responseParts: string[]; responseConvId: string | null }> {
  const chatUrl = `${baseUrl}/api/chat-local`;
  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const chatResp = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-nexus-auth": `Bearer ${nexusKey}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          messages,
          conversation_id: convId,
          chatwoot_conversation_id: chatwootConversationId ?? undefined,
          attachments,
          external_user_id: externalUserId,
        }),
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
          if (ev.debug || ev.edge_logs || ev.token_usage) return;
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

      return { error: null, fullContent, responseParts, responseConvId };
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
      if (responseConvId && sanitizedContent) {
        try {
          await supabase.rpc("save_message", {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
            p_role: "assistant",
            p_content: sanitizedContent,
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
          });
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

      fireDeliverMessage(
        baseUrl,
        authKey,
        {
          agent_id,
          conversation_id: responseConvId,
          external_user_id,
          channel,
          chatwoot_conversation_id,
          response_text: sanitizedContent,
          response_parts: responseParts,
        }
      ).catch((e) => console.error("[ProcessQueue] deliver-message failed:", e));

      return reply.send({
        status: "processed",
        conversation_id: result.responseConvId,
        parts: responseParts.length,
      });
    }
  );

  fastify.post("/queue/followups", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(501).send({
      error: "process-followups: implementar lógica completa (cron de follow-ups)",
    });
  });
}
