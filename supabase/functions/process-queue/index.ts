import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Buffer helpers ----------
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

// ---------- Call chat-agent ----------
async function callChatAgent(
  cloudUrl: string,
  cloudKey: string,
  nexusKey: string,
  agentId: string,
  messages: { role: string; content: string }[],
  convId: string | null,
  attachments?: any[]
) {
  const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;
  const chatResp = await fetch(chatAgentUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cloudKey}`,
      "x-nexus-auth": `Bearer ${nexusKey}`,
    },
    body: JSON.stringify({ agent_id: agentId, messages, conversation_id: convId, attachments }),
  });

  if (!chatResp.ok) {
    const errText = await chatResp.text();
    console.error("[ProcessQueue] chat-agent error:", chatResp.status, errText);
    return { error: errText, fullContent: "", responseParts: [] as string[], responseConvId: convId };
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

// ---------- Fire next stage ----------
async function fireNextStage(url: string, body: Record<string, unknown>, authKey: string): Promise<void> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    console.log(`[ProcessQueue] Fired deliver-message: ${resp.status}`);
    await resp.text().catch(() => {});
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.log("[ProcessQueue] Fired deliver-message (still processing)");
    } else {
      console.error("[ProcessQueue] Fire deliver-message error:", e.message);
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
      chatwoot_contact_id,
      contact_name,
      contact_avatar_url,
      user_message,
      debounce_ms,
      buffer_created_at,
      attachments,
    } = await req.json();

    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");
    const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
    const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server config" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);
    let finalMessage = user_message;

    // ---------- Debounce logic ----------
    if (debounce_ms > 0) {
      console.log(`[ProcessQueue] Sleeping ${debounce_ms}ms for debounce`);
      await new Promise((r) => setTimeout(r, debounce_ms));

      // Check if we're the last message
      if (buffer_created_at) {
        const imLast = await isLastMessage(supabase, agent_id, external_user_id, channel, buffer_created_at);
        if (!imLast) {
          console.log("[ProcessQueue] Newer message exists, exiting silently");
          return new Response(
            JSON.stringify({ status: "skipped", reason: "newer message arrived" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Consume all buffered messages
      const allMessages = await consumeBufferedMessages(supabase, agent_id, external_user_id, channel);
      console.log(`[ProcessQueue] Consolidated ${allMessages.length} message(s)`);

      if (allMessages.length > 0) {
        finalMessage = allMessages.join("\n");
        console.log(`[ProcessQueue] Consolidated: "${finalMessage.substring(0, 120)}..."`);
      }
    }

    // Allow processing if we have attachments (e.g., audio-only messages)
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!finalMessage && !hasAttachments) {
      console.error("[ProcessQueue] No message to process");
      return new Response(
        JSON.stringify({ error: "No message to process" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For audio/media-only messages, use a placeholder so the pipeline continues
    if (!finalMessage && hasAttachments) {
      finalMessage = "";
      console.log(`[ProcessQueue] No text but ${attachments.length} attachment(s), proceeding`);
    }

    // Strip Chatwoot contact name prefix
    finalMessage = finalMessage.replace(/^\*{1,2}[^*\n]+:\*{1,2}\s*\n?/gm, "").trim();

    // ---------- Conversation management ----------
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

    // Update contact info
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

    // ---------- Load conversation history ----------
    let conversationMessages: { role: string; content: string }[] = [];
    if (convId) {
      try {
        const { data: history } = await supabase.rpc("load_conversation_messages", {
          p_agent_id: agent_id,
          p_conversation_id: convId,
        });
        if (history && Array.isArray(history)) {
          conversationMessages = history.slice(-20).map((m: Record<string, unknown>) => ({
            role: m.role === "tool" ? "system" : (m.role as string),
            content: (m.content as string) || "",
          }));
        }
      } catch (e: any) {
        console.warn("[ProcessQueue] load history failed:", e.message);
      }
    }

    // ---------- Call chat-agent ----------
    const messages = [...conversationMessages, { role: "user", content: finalMessage }];
    console.log(`[ProcessQueue] Calling chat-agent with ${messages.length} messages, ${(attachments || []).length} attachment(s)`);

    const result = await callChatAgent(cloudUrl, cloudKey, nexusKey, agent_id, messages, convId, attachments);

    if (result.error) {
      return new Response(
        JSON.stringify({ error: "LLM processing failed", detail: result.error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ProcessQueue] Response: ${result.fullContent.length} chars, ${result.responseParts.length} parts`);

    // ---------- Fire deliver-message ----------
    const deliverUrl = `${cloudUrl}/functions/v1/deliver-message`;
    await fireNextStage(deliverUrl, {
      agent_id,
      conversation_id: result.responseConvId || convId,
      external_user_id,
      channel,
      chatwoot_conversation_id,
      response_text: result.fullContent,
      response_parts: result.responseParts,
    }, cloudKey);

    return new Response(
      JSON.stringify({
        status: "processed",
        conversation_id: result.responseConvId || convId,
        response_length: result.fullContent.length,
        parts: result.responseParts.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[ProcessQueue] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
