import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id, conversation_id, content } = await req.json();

    if (!agent_id || !conversation_id || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id, conversation_id, or content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");

    if (!nexusUrl || !nexusKey) {
      return new Response(
        JSON.stringify({ error: "Missing server config" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // 1) Load agent config
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id, name, config")
      .eq("id", agent_id)
      .maybeSingle();

    if (agentErr || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cfg = (agent.config || {}) as Record<string, any>;

    // 2) Find chatwoot_conversation_id via list_agent_conversations RPC
    //    (direct table query fails because conversations live in dynamic dp_* schemas)
    let chatwootConvId: number | null = null;
    let externalUserId: string | null = null;
    try {
      const { data: convList } = await supabase.rpc("list_agent_conversations", {
        p_agent_id: agent_id,
        p_limit: 200,
      });
      if (Array.isArray(convList)) {
        const match = convList.find((c: any) => c.id === conversation_id);
        if (match) {
          chatwootConvId = match.chatwoot_conversation_id ?? null;
          externalUserId = match.external_user_id ?? null;
          console.log(`[SendOperator] Found conv: cwConvId=${chatwootConvId}, extUser=${externalUserId}`);
        } else {
          console.warn(`[SendOperator] Conversation ${conversation_id} not found in list (${convList.length} convs)`);
        }
      }
    } catch (e: any) {
      console.warn("[SendOperator] list_agent_conversations failed:", e.message);
    }

    const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id && chatwootConvId);
    const hasWaha = !!(cfg.waha_url && cfg.waha_api_key);

    // 3) Send message to client
    let delivered = false;
    let deliveryMethod = "none";

    if (hasChatwoot) {
      // Send via Chatwoot
      const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
      const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwootConvId}/messages`;

      try {
        const resp = await fetch(msgUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.chatwoot_api_token}`,
          },
          body: JSON.stringify({
            content: content.trim(),
            message_type: "outgoing",
            private: false,
          }),
        });

        if (resp.ok) {
          delivered = true;
          deliveryMethod = "chatwoot";
          console.log(`[SendOperator] Message sent to Chatwoot conv ${chatwootConvId}`);
        } else {
          const errText = await resp.text();
          console.error(`[SendOperator] Chatwoot error ${resp.status}:`, errText);
        }
      } catch (e: any) {
        console.error("[SendOperator] Chatwoot fetch error:", e.message);
      }
    } else if (hasWaha && externalUserId) {
      // Fallback: send via WAHA if no Chatwoot conv ID
      const phone = externalUserId.replace(/\D/g, "");
      if (phone.length >= 10) {
        const wahaBase = (cfg.waha_url as string).replace(/\/+$/, "");
        const chatId = `${phone}@c.us`;
        try {
          const resp = await fetch(`${wahaBase}/api/sendText`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cfg.waha_api_key ? { "X-Api-Key": cfg.waha_api_key } : {}),
            },
            body: JSON.stringify({
              session: cfg.waha_session || "default",
              chatId,
              text: content.trim(),
            }),
          });
          if (resp.ok) {
            delivered = true;
            deliveryMethod = "waha";
            console.log(`[SendOperator] Message sent via WAHA to ${chatId}`);
          } else {
            const errText = await resp.text();
            console.error(`[SendOperator] WAHA error ${resp.status}:`, errText);
          }
        } catch (e: any) {
          console.error("[SendOperator] WAHA fetch error:", e.message);
        }
      }
    } else {
      console.log(`[SendOperator] No delivery channel available (hasChatwoot=${hasChatwoot}, hasWaha=${hasWaha}, cwConvId=${chatwootConvId}, extUser=${externalUserId})`);
    }

    // 4) Save to conversation history
    try {
      await supabase.rpc("save_message", {
        p_agent_id: agent_id,
        p_conversation_id: conversation_id,
        p_role: "assistant",
        p_content: content.trim(),
        p_model: "operator",
        p_tokens_input: 0,
        p_tokens_output: 0,
        p_latency_ms: 0,
        p_metadata: null,
      });
      console.log(`[SendOperator] Message saved to history`);
    } catch (e: any) {
      console.warn("[SendOperator] save_message failed:", e.message);
      // Retry without metadata
      try {
        await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: conversation_id,
          p_role: "assistant",
          p_content: content.trim(),
          p_model: "operator",
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: 0,
        });
      } catch { /* ignore */ }
    }

    return new Response(
      JSON.stringify({ status: "sent", delivered, delivery_method: deliveryMethod, chatwoot_conversation_id: chatwootConvId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[SendOperator] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
