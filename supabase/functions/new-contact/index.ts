import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- WAHA sender ----------
async function sendViaWaha(
  wahaUrl: string,
  wahaApiKey: string,
  wahaSession: string,
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = wahaUrl.replace(/\/+$/, "");
  const chatId = `${phone}@c.us`;

  try {
    const resp = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(wahaApiKey ? { "X-Api-Key": wahaApiKey } : {}),
      },
      body: JSON.stringify({
        session: wahaSession || "default",
        chatId,
        text: message,
      }),
    });

    if (resp.ok) {
      console.log(`[NewContact] WAHA message sent to ${chatId}`);
      return { ok: true };
    }

    const errText = await resp.text();
    console.error(`[NewContact] WAHA error ${resp.status}:`, errText);
    return { ok: false, error: errText };
  } catch (e: any) {
    console.error("[NewContact] WAHA fetch error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ---------- Chatwoot sender (fallback) ----------
async function sendViaChatwoot(
  cfg: Record<string, any>,
  phone: string,
  name: string | undefined,
  message: string
): Promise<{ ok: boolean; contactId?: number; chatwootConvId?: number; error?: string }> {
  const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
  const accountId = cfg.chatwoot_account_id;
  const apiToken = cfg.chatwoot_api_token;
  const inboxId = cfg.chatwoot_inbox_id;
  const phoneWithPlus = "+" + phone;

  // Search or create contact
  let contactId: number | null = null;

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
        console.log(`[NewContact] Found Chatwoot contact: ${contactId}`);
      }
    }
  } catch (e: any) {
    console.warn("[NewContact] Contact search failed:", e.message);
  }

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
        return { ok: false, error: errText };
      }
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  if (!contactId) return { ok: false, error: "Failed to find or create contact" };

  // Create conversation
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

  return { ok: true, contactId: contactId ?? undefined, chatwootConvId: chatwootConvId ?? undefined };
}

// ---------- Main ----------
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

    // Load agent config
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

    // Normalize phone
    let normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone.startsWith("55") && normalizedPhone.length <= 11) {
      normalizedPhone = "55" + normalizedPhone;
    }

    // Decide channel: WAHA first, Chatwoot fallback
    const hasWaha = !!(cfg.waha_url && cfg.waha_api_key);
    const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);

    let delivered = false;
    let deliveryMethod = "none";
    let chatwootConvId: number | undefined;
    let contactId: number | undefined;

    if (hasWaha) {
      console.log("[NewContact] Sending via WAHA");
      const result = await sendViaWaha(
        cfg.waha_url,
        cfg.waha_api_key,
        cfg.waha_session || "default",
        normalizedPhone,
        message.trim()
      );
      delivered = result.ok;
      deliveryMethod = "waha";

      if (!result.ok) {
        console.warn("[NewContact] WAHA failed, trying Chatwoot fallback");
        if (hasChatwoot) {
          const cwResult = await sendViaChatwoot(cfg, normalizedPhone, name, message.trim());
          delivered = cwResult.ok;
          deliveryMethod = "chatwoot_fallback";
          chatwootConvId = cwResult.chatwootConvId;
          contactId = cwResult.contactId;
        }
      }
    } else if (hasChatwoot) {
      console.log("[NewContact] Sending via Chatwoot (no WAHA configured)");
      const cwResult = await sendViaChatwoot(cfg, normalizedPhone, name, message.trim());
      delivered = cwResult.ok;
      deliveryMethod = "chatwoot";
      chatwootConvId = cwResult.chatwootConvId;
      contactId = cwResult.contactId;
    } else {
      return new Response(
        JSON.stringify({ error: "Agent has no WAHA or Chatwoot configuration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save conversation in our DB
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

    // Save outgoing message
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
        delivered,
        delivery_method: deliveryMethod,
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
