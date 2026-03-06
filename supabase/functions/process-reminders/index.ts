import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Chatwoot sender ----------
async function sendChatwootMessage(
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
      console.error(`[Reminder][Chatwoot] Error ${resp.status}:`, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error(`[Reminder][Chatwoot] Fetch error:`, e);
    return false;
  }
}

// ---------- WAHA sender ----------
async function sendWahaMessage(
  wahaUrl: string,
  wahaApiKey: string,
  wahaSession: string,
  phone: string,
  content: string
): Promise<boolean> {
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const baseUrl = wahaUrl.replace(/\/+$/, "");
    const resp = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(wahaApiKey ? { Authorization: `Bearer ${wahaApiKey}` } : {}),
      },
      body: JSON.stringify({ session: wahaSession, chatId, text: content }),
    });
    if (!resp.ok) {
      console.error(`[Reminder][WAHA] Error ${resp.status}:`, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e) {
    console.error(`[Reminder][WAHA] Fetch error:`, e);
    return false;
  }
}

// ---------- Build reminder message from template ----------
function buildReminderMessage(template: string, eventTitle: string, eventStartAt: string): string {
  const startDate = new Date(eventStartAt);
  const timeStr = startDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const dateStr = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });

  return template
    .replace(/\{titulo\}/gi, eventTitle)
    .replace(/\{horario\}/gi, timeStr)
    .replace(/\{data\}/gi, dateStr)
    .replace(/\{hora\}/gi, timeStr);
}

// ---------- Main handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // Fetch pending reminders that are due
    const { data: pendingItems, error: fetchErr } = await supabase
      .from("appointment_reminders")
      .select("*")
      .eq("status", "pending")
      .lte("remind_at", new Date().toISOString())
      .order("remind_at", { ascending: true })
      .limit(20);

    if (fetchErr) {
      console.error("[Reminder] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No pending reminders" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Reminder] Processing ${pendingItems.length} pending reminder(s)`);

    let processed = 0;
    let skipped = 0;

    for (const item of pendingItems) {
      // Fetch agent separately (no FK relationship)
      const { data: agent } = await supabase
        .from("agents")
        .select("id, name, config, status")
        .eq("id", item.agent_id)
        .single();

      if (!agent || agent.status !== "active") {
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      const cfg = (agent.config || {}) as Record<string, any>;

      // Check if reminders are still enabled
      if (!cfg.reminder_enabled) {
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      // Determine delivery channel
      const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
      const hasWaha = !!(cfg.waha_url && cfg.waha_session);

      if (!hasChatwoot && !hasWaha) {
        console.warn(`[Reminder] No delivery channel for agent ${agent.id}, cancelling`);
        await supabase
          .from("appointment_reminders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", item.id);
        skipped++;
        continue;
      }

      // Build reminder message
      const defaultTemplate = "Olá! 😊 Passando para lembrar do seu agendamento de {titulo} hoje às {horario}. Te esperamos! 🙌";
      const template = cfg.reminder_template || defaultTemplate;
      const message = buildReminderMessage(template, item.event_title, item.event_start_at);

      let sent = false;

      // Try Chatwoot first (if conversation exists)
      if (hasChatwoot && item.chatwoot_conversation_id) {
        const baseUrl = cfg.chatwoot_url.replace(/\/+$/, "");
        const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;
        sent = await sendChatwootMessage(msgUrl, cfg.chatwoot_api_token, message);
      }

      // Fallback to WAHA (or primary for manual events)
      if (!sent && hasWaha && item.external_user_id) {
        sent = await sendWahaMessage(
          cfg.waha_url,
          cfg.waha_api_key || "",
          cfg.waha_session,
          item.external_user_id,
          message
        );
      }

      if (sent) {
        console.log(`[Reminder] Sent reminder for event "${item.event_title}" at ${item.event_start_at}`);

        await supabase
          .from("appointment_reminders")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", item.id);

        // Save to conversation history (skip for manual events)
        if (!item.conversation_id.startsWith("manual-")) {
          try {
            await supabase.rpc("save_message", {
              p_agent_id: agent.id,
              p_conversation_id: item.conversation_id,
              p_role: "assistant",
              p_content: message,
              p_model: "reminder",
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: 0,
              p_metadata: JSON.stringify({}),
            });
          } catch (e) {
            console.warn("[Reminder] Could not save to history:", e);
          }
        }

        processed++;
      } else {
        console.error(`[Reminder] Failed to send for event "${item.event_title}"`);
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, total: pendingItems.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Reminder] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
