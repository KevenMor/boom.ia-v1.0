import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- Chatwoot sender ----------
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
    await resp.text();
    return true;
  } catch (e) {
    console.error(`[Chatwoot] Text msg fetch error:`, e);
    return false;
  }
}

// ---------- LLM follow-up generator ----------
async function generateFollowUpMessage(
  cloudUrl: string,
  cloudKey: string,
  nexusKey: string,
  agentId: string,
  followupAgentId: string | null,
  conversationId: string,
  attempt: number,
  maxAttempts: number,
  customPrompt: string | null,
  supabase: any
): Promise<string> {
  const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;
  const targetAgentId = followupAgentId || agentId;

  // Load conversation history for context
  let historyMessages: { role: string; content: string }[] = [];
  try {
    const { data: history } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: agentId, // always from original agent's conversation
      p_conversation_id: conversationId,
    });
    if (history && Array.isArray(history)) {
      historyMessages = history.slice(-30).map((m: any) => ({
        role: m.role === "tool" ? "system" : (m.role as string),
        content: (m.content as string) || "",
      }));
    }
  } catch (e) {
    console.warn("[FollowUp] Could not load history:", e);
  }

  // Build the follow-up instruction
  const defaultPrompt = `[SISTEMA INTERNO - FOLLOW-UP AUTOMÁTICO]
Escreva APENAS uma mensagem de follow-up (tentativa ${attempt} de ${maxAttempts}).
REGRAS:
- No máximo 1 ou 2 frases curtas e objetivas.
- Use o contexto da conversa anterior para personalizar.
- Não se apresente novamente. Não mencione que é automático.
- Varie o tom: ${attempt === 1 ? "leve e amigável" : attempt < maxAttempts ? "prestativo e objetivo" : "direto e respeitoso"}.
- Varie os fechamentos — não repita a mesma pergunta em todos os follow-ups.
- Nem sempre use o nome do cliente — alterne.
- Não repita estruturas de frases já usadas no histórico.
- Responda SOMENTE com o texto da mensagem.`;

  const promptText = customPrompt
    ? customPrompt
        .replace(/\{attempt\}/g, String(attempt))
        .replace(/\{max_attempts\}/g, String(maxAttempts))
    : defaultPrompt;

  const followUpInstruction = {
    role: "user",
    content: `[SISTEMA INTERNO - FOLLOW-UP AUTOMÁTICO]\n${promptText}`,
  };

  // Send full history + follow-up instruction to the target agent
  const messages = [...historyMessages, followUpInstruction];

  try {
    const chatResp = await fetch(chatAgentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudKey}`,
        "x-nexus-auth": `Bearer ${nexusKey}`,
      },
      body: JSON.stringify({
        agent_id: targetAgentId,
        messages,
        conversation_id: conversationId,
      }),
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text();
      console.error("[FollowUp] chat-agent error:", chatResp.status, errText);
      return "Oi! Tudo bem? Posso te ajudar com algo? 😊";
    }

    // Parse SSE stream
    const reader = chatResp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullContent = "";

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
          if (ev.conversation_id || ev.debug || ev.edge_logs) continue;
          const delta = ev.choices?.[0]?.delta?.content;
          if (delta && delta !== "<<MSG_SPLIT>>") {
            fullContent += delta;
          }
        } catch { /* skip */ }
      }
    }

    return fullContent.trim() || "Oi! Posso te ajudar com algo? 😊";
  } catch (e) {
    console.error("[FollowUp] Error generating message:", e);
    return "Oi! Tudo bem? Posso te ajudar com algo? 😊";
  }
}

// ---------- Check quiet hours ----------
function isQuietHours(quietStart: string, quietEnd: string, timezone: string): boolean {
  if (!quietStart || !quietEnd) return false;

  try {
    // Get current time in the specified timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      timeZone: timezone || "America/Sao_Paulo",
    });
    const parts = formatter.formatToParts(now);
    const currentHour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const currentMinute = Number(parts.find((p) => p.type === "minute")?.value || 0);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startH, startM] = quietStart.split(":").map(Number);
    const [endH, endM] = quietEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same day: e.g., 22:00 - 23:59 (doesn't cross midnight)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Crosses midnight: e.g., 22:00 - 08:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch (e) {
    console.error("[FollowUp] Quiet hours check error:", e);
    return false;
  }
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
      return new Response(JSON.stringify({ error: "Missing config" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);

    // Fetch pending follow-ups that are due
    const { data: pendingItems, error: fetchErr } = await supabase
      .from("follow_up_queue")
      .select("*, agents(id, name, config, status)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (fetchErr) {
      console.error("[FollowUp] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending follow-ups" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[FollowUp] Processing ${pendingItems.length} pending follow-up(s)`);

    let processed = 0;
    let skippedQuiet = 0;
    let skippedInactive = 0;

    for (const item of pendingItems) {
      const agent = item.agents;
      if (!agent || agent.status !== "active") {
        // Agent inactive — cancel
        await supabase.from("follow_up_queue").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", item.id);
        skippedInactive++;
        continue;
      }

      const cfg = (agent.config || {}) as Record<string, any>;

      // Check quiet hours
      const quietStart = cfg.followup_quiet_start || "";
      const quietEnd = cfg.followup_quiet_end || "";
      const timezone = cfg.followup_timezone || "America/Sao_Paulo";

      if (isQuietHours(quietStart, quietEnd, timezone)) {
        console.log(`[FollowUp] Skipping ${item.id} — quiet hours`);
        skippedQuiet++;
        continue; // Will be picked up next run
      }

      // Check Chatwoot config
      const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
      if (!hasChatwoot || !item.chatwoot_conversation_id) {
        console.warn(`[FollowUp] No Chatwoot config for agent ${agent.id}, cancelling`);
        await supabase.from("follow_up_queue").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", item.id);
        continue;
      }

      // Generate follow-up message via LLM
      const followUpMsg = await generateFollowUpMessage(
        cloudUrl, cloudKey, nexusKey, agent.id,
        cfg.followup_agent_id || null,
        item.conversation_id, item.attempt, item.max_attempts,
        cfg.followup_prompt || null,
        supabase
      );

      // Send to Chatwoot
      const baseUrl = cfg.chatwoot_url.replace(/\/+$/, "");
      const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;

      const sent = await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, followUpMsg);

      if (sent) {
        console.log(`[FollowUp] Sent attempt ${item.attempt}/${item.max_attempts} for conv ${item.conversation_id}`);

        // Mark current as sent
        await supabase.from("follow_up_queue").update({
          status: "sent", updated_at: new Date().toISOString(),
        }).eq("id", item.id);

        // Schedule next follow-up if not exhausted
        if (item.attempt < item.max_attempts) {
          const intervals = item.intervals_minutes as number[];
          const nextIdx = Math.min(item.attempt, intervals.length - 1); // Use last interval if beyond array
          const nextDelay = intervals[nextIdx] || intervals[intervals.length - 1] || 30;

          await supabase.rpc("schedule_followup", {
            p_agent_id: agent.id,
            p_conversation_id: item.conversation_id,
            p_external_user_id: item.external_user_id,
            p_channel: item.channel,
            p_chatwoot_conversation_id: item.chatwoot_conversation_id,
            p_attempt: item.attempt + 1,
            p_max_attempts: item.max_attempts,
            p_intervals_minutes: JSON.stringify(intervals),
            p_delay_minutes: nextDelay,
          });

          console.log(`[FollowUp] Scheduled next attempt ${item.attempt + 1} in ${nextDelay}min`);
        } else {
          console.log(`[FollowUp] Exhausted all ${item.max_attempts} attempts for conv ${item.conversation_id}`);
        }

        // Save follow-up message to conversation history
        try {
          await supabase.rpc("save_message", {
            p_agent_id: agent.id,
            p_conversation_id: item.conversation_id,
            p_role: "assistant",
            p_content: followUpMsg,
            p_model: "follow-up",
            p_tokens_in: 0,
            p_tokens_out: 0,
            p_latency: 0,
          });
        } catch (e) {
          console.warn("[FollowUp] Could not save to history:", e);
        }

        processed++;
      } else {
        console.error(`[FollowUp] Failed to send for conv ${item.conversation_id}`);
      }
    }

    return new Response(JSON.stringify({
      processed,
      skipped_quiet_hours: skippedQuiet,
      skipped_inactive: skippedInactive,
      total_pending: pendingItems.length,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FollowUp] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
