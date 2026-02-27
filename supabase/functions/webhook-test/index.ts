import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  console.log(`[Chatwoot] URL: ${url}`);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || !part.trim()) continue;

    try {
      const payload = { content: part.trim(), message_type: "outgoing", private: false };
      console.log(`[Chatwoot] Part ${i + 1}/${parts.length}: ${part.trim().substring(0, 80)}...`);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: apiToken,
        },
        body: JSON.stringify(payload),
      });

      const respText = await resp.text();
      if (!resp.ok) {
        console.error(`[Chatwoot] Reply error ${resp.status}:`, respText);
      } else {
        console.log(`[Chatwoot] Part ${i + 1} sent OK (${resp.status})`);
      }
    } catch (e) {
      console.error(`[Chatwoot] Reply fetch error for part ${i + 1}:`, e);
    }
  }
}

function parseChatwootPayload(body: Record<string, unknown>) {
  if (body.event === "message_created" && body.message_type === "incoming") {
    const sender = (body.sender || {}) as Record<string, unknown>;
    const conversation = (body.conversation || {}) as Record<string, unknown>;
    return {
      isChatwoot: true,
      message: (body.content as string) || "",
      externalUserId:
        String(sender.id ?? "") || (sender.phone_number as string) || (sender.email as string) || "chatwoot-user",
      chatwootConversationId: (conversation.id as number) ?? null,
      channel: (conversation.channel as string) || "chatwoot",
    };
  }
  return { isChatwoot: false, message: "", externalUserId: "", chatwootConversationId: null, channel: "" };
}

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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Accept agent_id from query param OR body
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agent_id") || (body.agent_id as string) || null;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing 'agent_id' — pass as query param or in body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);

    console.log(`[Webhook] Looking up agent: ${agentId}`);
    console.log(`[Webhook] Using key type: ${nexusKey.substring(0, 20)}...`);

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, status, tenant_id, config")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr || !agent) {
      console.error("[Webhook] Agent lookup failed:", { agentId, agentErr });
      return new Response(JSON.stringify({ error: "Invalid agent_id" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[Webhook] Agent found: ${agent.name} (status: ${agent.status})`);

    if (agent.status !== "active") {
      return new Response(JSON.stringify({ error: "Agent is not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatwoot = parseChatwootPayload(body);

    let userMessage: string;
    let externalUserId: string;
    let channel: string;
    let chatwootConversationId: number | null = null;

    if (chatwoot.isChatwoot) {
      userMessage = chatwoot.message;
      externalUserId = chatwoot.externalUserId;
      channel = chatwoot.channel;
      chatwootConversationId = chatwoot.chatwootConversationId;
    } else {
      userMessage = (body.message || body.text || body.content || "") as string;
      externalUserId = (body.external_user_id || body.from || body.sender || body.phone || "anonymous") as string;
      channel = (body.channel || "webhook") as string;
    }

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "No message content. Use 'message', 'text', or 'content' field." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        });
        convId = data;
      } catch (e) {
        console.error("Could not create conversation:", e);
      }
    }

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

    const messages = [...conversationMessages, { role: "user", content: userMessage }];

    const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;
    const chatResp = await fetch(chatAgentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudKey}`,
        "x-nexus-auth": `Bearer ${nexusKey}`,
      },
      body: JSON.stringify({ agent_id: agent.id, messages, conversation_id: convId }),
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text();
      console.error("chat-agent error:", chatResp.status, errText);
      return new Response(JSON.stringify({ error: "Agent processing failed", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          if (ev.conversation_id) {
            responseConvId = ev.conversation_id;
            continue;
          }
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
        } catch {
          /* skip */
        }
      }
    }

    if (currentPart.trim()) responseParts.push(currentPart.trim());

    console.log(`[Webhook] Full response length: ${fullContent.length}, parts: ${responseParts.length}`);
    console.log(`[Webhook] isChatwoot: ${chatwoot.isChatwoot}, convId: ${chatwootConversationId}`);

    const cfg = (agent.config || {}) as Record<string, string>;
    const hasChatwootConfig = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
    console.log(`[Webhook] Chatwoot config present: ${hasChatwootConfig}`);

    if (chatwoot.isChatwoot && chatwootConversationId && hasChatwootConfig) {
      console.log(`[Webhook] → Sending reply to Chatwoot...`);
      await replyToChatwoot(
        cfg.chatwoot_url,
        cfg.chatwoot_api_token,
        cfg.chatwoot_account_id,
        chatwootConversationId,
        fullContent.trim(),
        responseParts
      );
      console.log(`[Webhook] → Chatwoot reply complete`);
    } else if (!chatwoot.isChatwoot) {
      console.log(`[Webhook] Not a Chatwoot payload, skipping reply`);
    } else {
      console.log(`[Webhook] Missing Chatwoot config or conversationId, skipping reply`);
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
