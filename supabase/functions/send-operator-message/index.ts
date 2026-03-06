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

    // 1) Load agent config for Chatwoot credentials
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

    // 2) Find chatwoot_conversation_id from conversation record
    let chatwootConvId: number | null = null;
    try {
      const { data: convData } = await supabase
        .from("conversations")
        .select("chatwoot_conversation_id")
        .eq("id", conversation_id)
        .maybeSingle();
      chatwootConvId = convData?.chatwoot_conversation_id ?? null;
    } catch (e: any) {
      console.warn("[SendOperator] Failed to lookup chatwoot_conversation_id:", e.message);
    }

    const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id && chatwootConvId);

    // 3) Send via Chatwoot if configured
    let delivered = false;
    if (hasChatwoot) {
      const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
      const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwootConvId}/messages`;

      try {
        const resp = await fetch(msgUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            api_access_token: cfg.chatwoot_api_token,
          },
          body: JSON.stringify({
            content: content.trim(),
            message_type: "outgoing",
            private: false,
          }),
        });

        if (resp.ok) {
          delivered = true;
          console.log(`[SendOperator] Message sent to Chatwoot conv ${chatwootConvId}`);
        } else {
          const errText = await resp.text();
          console.error(`[SendOperator] Chatwoot error ${resp.status}:`, errText);
        }
      } catch (e: any) {
        console.error("[SendOperator] Chatwoot fetch error:", e.message);
      }
    } else {
      console.log("[SendOperator] No Chatwoot config, saving message only");
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
      });
      console.log(`[SendOperator] Message saved to history`);
    } catch (e: any) {
      console.warn("[SendOperator] save_message failed:", e.message);
    }

    return new Response(
      JSON.stringify({ status: "sent", delivered, chatwoot_conversation_id: chatwootConvId }),
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
