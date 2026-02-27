import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY");
    const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
    const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract token from URL
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing 'token' query parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service-role-like access (nexus anon key has broad access in self-hosted)
    const supabase = createClient(nexusUrl, nexusKey);

    // 1. Find agent by webhook_token
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, status, tenant_id")
      .eq("webhook_token", token)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Invalid webhook token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (agent.status !== "active") {
      return new Response(JSON.stringify({ error: "Agent is not active" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse incoming payload
    const body = await req.json();
    const userMessage = body.message || body.text || body.content || "";
    const externalUserId = body.external_user_id || body.from || body.sender || body.phone || "anonymous";
    const channel = body.channel || "webhook";
    const conversationId = body.conversation_id || null;

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "No message content provided. Use 'message', 'text', or 'content' field." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Find or create conversation
    let convId = conversationId;
    if (!convId) {
      // Look for an open conversation for this external user + agent
      const { data: existingConv } = await supabase.rpc("find_or_create_webhook_conversation", {
        p_agent_id: agent.id,
        p_channel: channel,
        p_external_user_id: externalUserId,
      });
      convId = existingConv;
    }

    // If the RPC doesn't exist yet, fallback to create_conversation
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
        const { data: history } = await supabase.rpc("load_conversation_messages", {
          p_agent_id: agent.id,
          p_conversation_id: convId,
        });
        if (history && Array.isArray(history)) {
          // Take last 20 messages for context
          conversationMessages = history.slice(-20).map((m: any) => ({
            role: m.role === "tool" ? "system" : m.role,
            content: m.content || "",
          }));
        }
      } catch (e) {
        console.warn("Could not load conversation history:", e);
      }
    }

    // 5. Build messages array with history + new user message
    const messages = [
      ...conversationMessages,
      { role: "user", content: userMessage },
    ];

    // 6. Call chat-agent edge function (on Lovable Cloud)
    // We need to forward the nexus auth header so chat-agent can access the DB
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
      return new Response(JSON.stringify({ error: "Agent processing failed", detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          // Capture conversation_id from first event
          if (ev.conversation_id) {
            responseConvId = ev.conversation_id;
            continue;
          }
          // Skip debug/log events
          if (ev.debug || ev.edge_logs) continue;

          // Collect content
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

    // Push last part
    if (currentPart.trim()) responseParts.push(currentPart.trim());

    // 8. Return structured JSON response
    return new Response(
      JSON.stringify({
        agent_id: agent.id,
        agent_name: agent.name,
        conversation_id: responseConvId,
        external_user_id: externalUserId,
        channel,
        response: fullContent.trim(),
        // Split into individual message parts (for WhatsApp-like platforms that send separate bubbles)
        message_parts: responseParts.length > 0 ? responseParts : [fullContent.trim()],
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
