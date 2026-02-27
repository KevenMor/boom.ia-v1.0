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
    // Download the image first
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      console.error(`[Chatwoot] Image download failed ${imgResp.status}: ${imageUrl}`);
      return false;
    }

    const imgBlob = await imgResp.blob();
    // Extract filename from URL
    const urlPath = new URL(imageUrl).pathname;
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
    return false;
  }
}

// ---------- Chatwoot reply ----------
async function replyToChatwoot(
  chatwootUrl: string,
  apiToken: string,
  accountId: string,
  conversationId: number,
  content: string,
  messageParts: string[]
) {
  const baseUrl = chatwootUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
  const parts = messageParts.length > 0 ? messageParts : [content];

  console.log(`[Chatwoot] Sending ${parts.length} message(s) to conv ${conversationId}`);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !part.trim()) continue;

    const { textOnly, imageUrls } = extractImagesFromMarkdown(part);

    // Send text portion (if any)
    if (textOnly.trim()) {
      const ok = await sendChatwootTextMessage(url, apiToken, textOnly.trim());
      console.log(`[Chatwoot] Part ${i + 1} text: ${ok ? "OK" : "FAIL"}`);
    }

    // Send each image as attachment
    for (let j = 0; j < imageUrls.length; j++) {
      const caption = j === 0 && !textOnly.trim() ? "" : "";
      const ok = await sendChatwootImageMessage(url, apiToken, imageUrls[j], caption);
      console.log(`[Chatwoot] Part ${i + 1} image ${j + 1}/${imageUrls.length}: ${ok ? "OK" : "FAIL"}`);
    }

    // If no text and no images, send as-is
    if (!textOnly.trim() && imageUrls.length === 0) {
      await sendChatwootTextMessage(url, apiToken, part.trim());
    }
  }
}

// ---------- Chatwoot payload parser ----------
function parseChatwootPayload(body: Record<string, unknown>) {
  if (body.event === "message_created" && body.message_type === "incoming") {
    const sender = (body.sender || {}) as Record<string, unknown>;
    const conversation = (body.conversation || {}) as Record<string, unknown>;
    return {
      isChatwoot: true,
      message: (body.content as string) || "",
      externalUserId:
        String(sender.id ?? "") || (sender.phone_number as string) || (sender.email as string) || "chatwoot-user",
      contactName: (sender.name as string) || null,
      contactAvatarUrl: (sender.thumbnail as string) || (sender.avatar_url as string) || null,
      chatwootConversationId: (conversation.id as number) ?? null,
      channel: (conversation.channel as string) || "chatwoot",
    };
  }
  return { isChatwoot: false, message: "", externalUserId: "", contactName: null as string | null, contactAvatarUrl: null as string | null, chatwootConversationId: null, channel: "" };
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

  // Mark all as processed
  const ids = pending.map((m: any) => m.id);
  await supabase
    .from("webhook_message_buffer")
    .update({ processed: true })
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
    let contactName: string | null = null;
    let contactAvatarUrl: string | null = null;

    if (chatwoot.isChatwoot) {
      userMessage = chatwoot.message;
      externalUserId = chatwoot.externalUserId;
      channel = chatwoot.channel;
      chatwootConversationId = chatwoot.chatwootConversationId;
      contactName = chatwoot.contactName;
      contactAvatarUrl = chatwoot.contactAvatarUrl;
    } else {
      userMessage = (body.message || body.text || body.content || "") as string;
      externalUserId = (body.external_user_id || body.from || body.sender || body.phone || "anonymous") as string;
      channel = (body.channel || "webhook") as string;
    }

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "No message content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Debounce logic ----
    const debounceMs = Number(cfg.message_debounce_ms) || 0; // 0 = disabled

    if (debounceMs > 0) {
      console.log(`[Debounce] Buffering message, window: ${debounceMs}ms`);

      const buffered = await bufferMessage(
        supabase, agentId, externalUserId, channel, userMessage, chatwootConversationId
      );

      if (!buffered) {
        // Buffer insert failed — fall through to process immediately
        console.warn("[Debounce] Buffer failed, processing immediately");
      } else {
        // Sleep for debounce window
        await new Promise((r) => setTimeout(r, debounceMs));

        // Check if a newer message arrived during sleep
        const imLast = await isLastMessage(supabase, agentId, externalUserId, channel, buffered.created_at);

        if (!imLast) {
          console.log(`[Debounce] Newer message exists, exiting silently`);
          return new Response(
            JSON.stringify({ status: "buffered", message: "Waiting for more messages" }),
            { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // I'm the last message! Consume all buffered messages
        const allMessages = await consumeBufferedMessages(supabase, agentId, externalUserId, channel);
        console.log(`[Debounce] Consolidated ${allMessages.length} message(s)`);

        // Replace userMessage with consolidated content
        if (allMessages.length > 0) {
          userMessage = allMessages.join("\n");
          console.log(`[Debounce] Consolidated: "${userMessage.substring(0, 120)}..."`);
        }
      }
    }

    // ---- Conversation management ----
    const conversationId = (body.conversation_id || null) as string | null;
    let convId = conversationId;

    if (!convId) {
      try {
        const { data: existingConv } = await supabase.rpc("find_or_create_webhook_conversation", {
          p_agent_id: agent.id,
          p_channel: channel,
          p_external_user_id: externalUserId,
        });
        convId = existingConv;
      } catch (e) {
        console.warn("find_or_create_webhook_conversation failed:", e);
      }
    }

    if (!convId) {
      try {
        const { data } = await supabase.rpc("create_conversation", {
          p_agent_id: agent.id,
          p_channel: channel,
          p_external_user_id: externalUserId,
          p_contact_name: contactName,
          p_contact_avatar_url: contactAvatarUrl,
        });
        convId = data;
      } catch (e) {
        console.error("Could not create conversation:", e);
      }
    }

    // Update contact info if we have it and conv already existed
    if (convId && (contactName || contactAvatarUrl)) {
      try {
        await supabase.rpc("update_conversation_contact", {
          p_agent_id: agent.id,
          p_conversation_id: convId,
          p_contact_name: contactName,
          p_contact_avatar_url: contactAvatarUrl,
        });
      } catch (e) {
        console.warn("Could not update contact info:", e);
      }
    }

    // ---- Load conversation history ----
    let conversationMessages: { role: string; content: string }[] = [];
    if (convId) {
      try {
        const { data: history } = await supabase.rpc("load_conversation_messages", {
          p_agent_id: agent.id,
          p_conversation_id: convId,
        });
        if (history && Array.isArray(history)) {
          conversationMessages = history.slice(-20).map((m: Record<string, unknown>) => ({
            role: m.role === "tool" ? "system" : (m.role as string),
            content: (m.content as string) || "",
          }));
        }
      } catch (e) {
        console.warn("Could not load conversation history:", e);
      }
    }

    // ---- Call chat-agent ----
    const messages = [...conversationMessages, { role: "user", content: userMessage }];

    const result = await callChatAgent(cloudUrl, cloudKey, nexusKey, agent.id, messages, convId);

    if (result.error) {
      return new Response(JSON.stringify({ error: "Agent processing failed", detail: result.error }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fullContent, responseParts, responseConvId } = result;

    console.log(`[Webhook] Response: ${fullContent.length} chars, ${responseParts.length} parts`);

    // ---- Reply to Chatwoot ----
    const hasChatwootConfig = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);

    if (chatwoot.isChatwoot && chatwootConversationId && hasChatwootConfig) {
      console.log(`[Webhook] → Replying to Chatwoot conv ${chatwootConversationId}`);
      await replyToChatwoot(
        cfg.chatwoot_url,
        cfg.chatwoot_api_token,
        cfg.chatwoot_account_id,
        chatwootConversationId,
        fullContent.trim(),
        responseParts
      );
    }

    return new Response(
      JSON.stringify({
        agent_id: agent.id,
        agent_name: agent.name,
        conversation_id: responseConvId,
        external_user_id: externalUserId,
        channel,
        response: fullContent.trim(),
        message_parts: responseParts.length > 0 ? responseParts : [fullContent.trim()],
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
