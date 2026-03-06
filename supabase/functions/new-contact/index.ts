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
    const { agent_id, phone, name, message } = await req.json();

    if (!agent_id || !phone?.trim() || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id, phone, or message" }),
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
    const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);

    if (!hasChatwoot) {
      return new Response(
        JSON.stringify({ error: "Agent has no Chatwoot configuration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
    const accountId = cfg.chatwoot_account_id;
    const apiToken = cfg.chatwoot_api_token;
    const inboxId = cfg.chatwoot_inbox_id;

    // Normalize phone: ensure +55 prefix
    let normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone.startsWith("55") && normalizedPhone.length <= 11) {
      normalizedPhone = "55" + normalizedPhone;
    }
    const phoneWithPlus = "+" + normalizedPhone;

    // 2) Search or create contact in Chatwoot
    let contactId: number | null = null;

    // Search existing contact by phone
    try {
      const searchResp = await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneWithPlus)}`,
        { headers: { api_access_token: apiToken } }
      );
      if (searchResp.ok) {
        const searchData = await searchResp.json();
        const payload = searchData.payload || [];
        if (payload.length > 0) {
          contactId = payload[0].id;
          console.log(`[NewContact] Found existing Chatwoot contact: ${contactId}`);
        }
      }
    } catch (e: any) {
      console.warn("[NewContact] Contact search failed:", e.message);
    }

    // Create contact if not found
    if (!contactId) {
      try {
        const createResp = await fetch(
          `${baseUrl}/api/v1/accounts/${accountId}/contacts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", api_access_token: apiToken },
            body: JSON.stringify({
              name: name?.trim() || phoneWithPlus,
              phone_number: phoneWithPlus,
              ...(inboxId ? { inbox_id: Number(inboxId) } : {}),
            }),
          }
        );
        if (createResp.ok) {
          const createData = await createResp.json();
          contactId = createData.payload?.contact?.id || createData.payload?.id || createData.id;
          console.log(`[NewContact] Created Chatwoot contact: ${contactId}`);
        } else {
          const errText = await createResp.text();
          console.error(`[NewContact] Create contact failed ${createResp.status}:`, errText);
        }
      } catch (e: any) {
        console.error("[NewContact] Create contact error:", e.message);
      }
    }

    if (!contactId) {
      return new Response(
        JSON.stringify({ error: "Failed to find or create contact in Chatwoot" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Create conversation in Chatwoot
    let chatwootConvId: number | null = null;
    try {
      const convBody: Record<string, any> = {
        contact_id: contactId,
        message: { content: message.trim() },
        status: "open",
      };
      if (inboxId) convBody.inbox_id = Number(inboxId);

      const convResp = await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", api_access_token: apiToken },
          body: JSON.stringify(convBody),
        }
      );

      if (convResp.ok) {
        const convData = await convResp.json();
        chatwootConvId = convData.id || convData.payload?.id;
        console.log(`[NewContact] Created Chatwoot conversation: ${chatwootConvId}`);
      } else {
        const errText = await convResp.text();
        console.error(`[NewContact] Create conversation failed ${convResp.status}:`, errText);
      }
    } catch (e: any) {
      console.error("[NewContact] Create conversation error:", e.message);
    }

    // 4) Create conversation in our database
    let convId: string | null = null;
    try {
      const { data } = await supabase.rpc("create_conversation", {
        p_agent_id: agent_id,
        p_channel: "whatsapp",
        p_external_user_id: normalizedPhone,
        p_contact_name: name?.trim() || null,
        p_contact_avatar_url: null,
      });
      convId = data;
      console.log(`[NewContact] Created DB conversation: ${convId}`);
    } catch (e: any) {
      console.warn("[NewContact] create_conversation RPC failed:", e.message);
    }

    // 5) Save the outgoing message in history
    if (convId) {
      try {
        await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "assistant",
          p_content: message.trim(),
          p_model: "operator",
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: 0,
          p_metadata: null,
        });
      } catch (e: any) {
        console.warn("[NewContact] save_message failed:", e.message);
      }
    }

    return new Response(
      JSON.stringify({
        status: "created",
        contact_id: contactId,
        chatwoot_conversation_id: chatwootConvId,
        conversation_id: convId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[NewContact] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
