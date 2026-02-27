import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Send a message back to Chatwoot conversation */
async function replyToChatwoot(
  chatwootUrl: string,
  apiToken: string,
  accountId: string,
  conversationId: number,
  content: string,
  messageParts: string[]
) {
  const url = `${chatwootUrl.replace(/\/+$/, "")}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

  // Send each message part as a separate bubble for natural feel
  const parts = messageParts.length > 0 ? messageParts : [content];
  for (const part of parts) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_access_token: apiToken,
        },
        body: JSON.stringify({
          content: part,
          message_type: "outgoing",
          private: false,
        }),
      });
      if (!resp.ok) {
        console.error("Chatwoot reply error:", resp.status, await resp.text());
      }
    } catch (e) {
      console.error("Chatwoot reply fetch error:", e);
    }
  }
}

/** Detect if payload is from Chatwoot */
function parseChatwootPayload(body: any): {
  isChatwoot: boolean;
  message: string;
  externalUserId: string;
  chatwootConversationId: number | null;
  channel: string;
} {
  // Chatwoot webhooks have event field like "message_created"
  if (body.event === "message_created" && body.message_type === "incoming") {
    return {
      isChatwoot: true,
      message: body.content || "",
      externalUserId:
        body.sender?.id?.toString() ||
        body.sender?.phone_number ||
        body.sender?.email ||
        "chatwoot-user",
      chatwootConversationId: body.conversation?.id || null,
      channel: body.conversation?.channel || "chatwoot",
    };
  }
  return {
    isChatwoot: false,
    message: "",
    externalUserId: "",
    chatwootConversationId: null,
    channel: "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY");
    const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
    const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!nexusUrl || !nexusKey) {
      return new Response(
        JSON.stringify({ error: "Missing server configuration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing 'token' query parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // 1. Find agent by webhook_token (include config for chatwoot settings)
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, status, tenant_id, config")
      .eq("webhook_token", token)
      .single();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (agent.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Agent is not active" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Parse incoming payload
    const body = await req.json();

    // Detect Chatwoot payload
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
      // Generic payload
      userMessage = body.message || body.text || body.content || "";
      externalUserId =
        body.external_user_id ||
        body.from ||
        body.sender ||
        body.phone ||
        "anonymous";
      channel = body.channel || "webhook";
    }

    if (!userMessage) {
      return new Response(
        JSON.stringify({
          error:
            "No message content provided. Use 'message', 'text', or 'content' field.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const conversationId = body.conversation_id || null;

    // 3. Find or create conversation
    let convId = conversationId;
    if (!convId) {
      try {
        const { data: existingConv } = await supabase.rpc(
          "find_or_create_webhook_conversation",
          {
            p_agent_id: agent.id,
            p_channel: channel,
            p_external_user_id: externalUserId,
          }
        );
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

    // 4. Load conversation history for context
    let conversationMessages: { role: string; content: string }[] = [];
    if (convId) {
      try {
        const { data: history } = await supabase.rpc(
          "load_conversation_messages",
          {
            p_agent_id: agent.id,
            p_conversation_id: convId,
          }
        );
        if (history && Array.isArray(history)) {
          conversationMessages = history.slice(-20).map((m: any) => ({
            role: m.role === "tool" ? "system" : m.role,
            content: m.content || "",
          }));
        }
      } catch (e) {
        console.warn("Could not load conversation history:", e);
      }
    }

    // 5. Build messages array
    const messages = [
      ...conversationMessages,
      { role: "user", content: userMessage },
    ];

    // 6. Call chat-agent edge function
    const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;

    const chatResp = await fetch(chatAgentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudKey}`,
        "x-nexus-auth": `Bearer ${nexusKey}`,
      },
      body: JSON.stringify({
        agent_id: agent.id,
        messages,
        conversation_id: convId,
      }),
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text();
      console.error("chat-agent error:", chatResp.status, errText);
      return new Response(
        JSON.stringify({ error: "Agent processing failed", detail: errText }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Consume SSE stream and collect full response
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

    // 8. If Chatwoot, send response back via Chatwoot API
    const cfg = (agent.config || {}) as Record<string, any>;
    if (
      chatwoot.isChatwoot &&
      chatwootConversationId &&
      cfg.chatwoot_url &&
      cfg.chatwoot_api_token &&
      cfg.chatwoot_account_id
    ) {
      await replyToChatwoot(
        cfg.chatwoot_url,
        cfg.chatwoot_api_token,
        cfg.chatwoot_account_id,
        chatwootConversationId,
        fullContent.trim(),
        responseParts
      );
    }

    // 9. Return structured JSON response
    return new Response(
      JSON.stringify({
        agent_id: agent.id,
        agent_name: agent.name,
        conversation_id: responseConvId,
        external_user_id: externalUserId,
        channel,
        response: fullContent.trim(),
        message_parts:
          responseParts.length > 0 ? responseParts : [fullContent.trim()],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("webhook-inbound error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
