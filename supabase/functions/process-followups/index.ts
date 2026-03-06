import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getFollowupPrompt } from "../_shared/prompts/registry.ts";

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_access_token: apiToken },
      body: JSON.stringify({ content, message_type: "outgoing", private: false }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      console.error(`[Chatwoot] Text msg error ${resp.status}:`, await resp.text());
      return false;
    }
    await resp.text();
    return true;
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error(`[Chatwoot] Text msg TIMEOUT (15s)`);
    } else {
      console.error(`[Chatwoot] Text msg fetch error:`, e);
    }
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
  tenantSlugParam: string | null,
  supabase: any
): Promise<string> {
  const chatAgentUrl = `${cloudUrl}/functions/v1/chat-agent`;
  const targetAgentId = followupAgentId || agentId;

  // Load conversation history for context
  let historyMessages: { role: string; content: string }[] = [];
  try {
    const { data: history } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: agentId,
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
  const tenantSlug = (typeof tenantSlugParam === "string") ? tenantSlugParam : null;
  const registryPrompt = getFollowupPrompt(tenantSlug);

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

  const rawPrompt = registryPrompt || customPrompt || defaultPrompt;
  const promptText = rawPrompt
    .replace(/\{attempt\}/g, String(attempt))
    .replace(/\{max_attempts\}/g, String(maxAttempts));

  const followUpInstruction = {
    role: "user",
    content: `[SISTEMA INTERNO - FOLLOW-UP AUTOMÁTICO]\n${promptText}`,
  };

  const messages = [...historyMessages, followUpInstruction];

  try {
    // 60s timeout for the entire chat-agent call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log(`[FollowUp] Calling chat-agent for agent ${targetAgentId}, conv ${conversationId} (${messages.length} msgs)`);

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
      signal: controller.signal,
    });

    if (!chatResp.ok) {
      clearTimeout(timeoutId);
      const errText = await chatResp.text();
      console.error("[FollowUp] chat-agent error:", chatResp.status, errText);
      return "Oi! Tudo bem? Posso te ajudar com algo? 😊";
    }

    // Parse SSE stream with read timeout
    const reader = chatResp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let fullContent = "";
    const streamStart = Date.now();
    const STREAM_TIMEOUT = 55000;

    while (true) {
      if (Date.now() - streamStart > STREAM_TIMEOUT) {
        console.warn("[FollowUp] SSE stream timeout, using partial content");
        reader.cancel().catch(() => {});
        break;
      }
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

    clearTimeout(timeoutId);
    console.log(`[FollowUp] LLM generated ${fullContent.length} chars in ${Date.now() - streamStart}ms`);
    return fullContent.trim() || "Oi! Posso te ajudar com algo? 😊";
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[FollowUp] chat-agent TIMEOUT (60s)");
    } else {
      console.error("[FollowUp] Error generating message:", e);
    }
    return "Oi! Tudo bem? Posso te ajudar com algo? 😊";
  }
}

// ---------- Check quiet hours ----------
function isQuietHours(quietStart: string, quietEnd: string, timezone: string): boolean {
  if (!quietStart || !quietEnd) return false;

  try {
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
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
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
      .select("*, agents(id, name, config, status, tenants(slug))")
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

    // Deduplicate by external_user_id
    const seenUsers = new Set<string>();
    const dedupedItems: typeof pendingItems = [];
    const skippedDedupIds: string[] = [];

    for (const item of pendingItems) {
      const userKey = item.external_user_id;
      if (seenUsers.has(userKey)) {
        skippedDedupIds.push(item.id);
        continue;
      }
      seenUsers.add(userKey);
      dedupedItems.push(item);
    }

    if (skippedDedupIds.length > 0) {
      console.log(`[FollowUp] Dedup: cancelling ${skippedDedupIds.length} duplicate(s)`);
      await supabase
        .from("follow_up_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("id", skippedDedupIds);
    }

    let processed = 0;
    let skippedQuiet = 0;
    let skippedInactive = 0;
    const skippedDedup = skippedDedupIds.length;

    for (const item of dedupedItems) {
      console.log(`[FollowUp] Processing item ${item.id}: agent=${item.agent_id}, conv=${item.conversation_id}, attempt=${item.attempt}/${item.max_attempts}`);

      try {
        const agent = item.agents;
        if (!agent || agent.status !== "active") {
          console.log(`[FollowUp] Agent inactive or not found, cancelling ${item.id}`);
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
          console.log(`[FollowUp] Skipping ${item.id} — quiet hours (${quietStart}-${quietEnd} ${timezone})`);
          skippedQuiet++;
          continue;
        }

        // Check Chatwoot config
        const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);
        if (!hasChatwoot || !item.chatwoot_conversation_id) {
          console.warn(`[FollowUp] No Chatwoot config for agent ${agent.id}, cancelling`);
          await supabase.from("follow_up_queue").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", item.id);
          continue;
        }

        // Check if a human agent is assigned (10s timeout)
        try {
          const assigneeController = new AbortController();
          const assigneeTimeout = setTimeout(() => assigneeController.abort(), 10000);
          const baseUrlCheck = cfg.chatwoot_url.replace(/\/+$/, "");
          const convCheckUrl = `${baseUrlCheck}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}`;
          console.log(`[FollowUp] Checking Chatwoot assignee for conv ${item.chatwoot_conversation_id}`);
          const convResp = await fetch(convCheckUrl, {
            headers: { "Content-Type": "application/json", api_access_token: cfg.chatwoot_api_token },
            signal: assigneeController.signal,
          });
          clearTimeout(assigneeTimeout);
          if (convResp.ok) {
            const convData = await convResp.json();
            const assignee = convData?.meta?.assignee || convData?.assignee;
            if (assignee && assignee.id) {
              console.log(`[FollowUp] Human agent assigned (${assignee.name || assignee.id}) to conv ${item.chatwoot_conversation_id}, cancelling`);
              await supabase.from("follow_up_queue").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", item.id);
              await supabase.rpc("cancel_pending_followups", {
                p_agent_id: agent.id,
                p_conversation_id: item.conversation_id,
              });
              continue;
            }
            console.log(`[FollowUp] No human assignee, proceeding`);
          } else {
            console.warn(`[FollowUp] Chatwoot assignee check returned ${convResp.status}, proceeding anyway`);
          }
        } catch (e: any) {
          const reason = e.name === "AbortError" ? "TIMEOUT (10s)" : e?.message;
          console.warn(`[FollowUp] Chatwoot assignee check failed: ${reason}, proceeding anyway`);
        }

        // Generate follow-up message via LLM
        console.log(`[FollowUp] Generating follow-up message...`);
        const tenantSlug = agent.tenants?.slug || null;
        const followUpMsg = await generateFollowUpMessage(
          cloudUrl, cloudKey, nexusKey, agent.id,
          cfg.followup_agent_id || null,
          item.conversation_id, item.attempt, item.max_attempts,
          cfg.followup_prompt || null,
          tenantSlug,
          supabase
        );
        console.log(`[FollowUp] Generated message: "${followUpMsg.substring(0, 80)}..."`);

        // Send to Chatwoot
        const baseUrl = cfg.chatwoot_url.replace(/\/+$/, "");
        const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${item.chatwoot_conversation_id}/messages`;

        console.log(`[FollowUp] Sending to Chatwoot conv ${item.chatwoot_conversation_id}`);
        const sent = await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, followUpMsg);

        if (sent) {
          console.log(`[FollowUp] ✅ Sent attempt ${item.attempt}/${item.max_attempts} for conv ${item.conversation_id}`);

          // Mark current as sent
          await supabase.from("follow_up_queue").update({
            status: "sent", updated_at: new Date().toISOString(),
          }).eq("id", item.id);

          // Schedule next follow-up if not exhausted
          if (item.attempt < item.max_attempts) {
            const currentIntervals: number[] = Array.isArray(cfg.followup_intervals) ? cfg.followup_intervals : [10, 20, 30];
            const currentMaxAttempts = Number(cfg.followup_max_attempts) || currentIntervals.length;
            const effectiveMaxAttempts = Math.min(item.max_attempts, currentMaxAttempts);

            if (item.attempt >= effectiveMaxAttempts) {
              console.log(`[FollowUp] Agent config reduced max_attempts to ${effectiveMaxAttempts}, stopping`);
              await supabase.from("follow_up_queue").update({ status: "exhausted", updated_at: new Date().toISOString() }).eq("id", item.id);
            } else {
              const nextIdx = Math.min(item.attempt, currentIntervals.length - 1);
              const nextDelay = currentIntervals[nextIdx] || currentIntervals[currentIntervals.length - 1] || 30;

              await supabase.rpc("schedule_followup", {
                p_agent_id: agent.id,
                p_conversation_id: item.conversation_id,
                p_external_user_id: item.external_user_id,
                p_channel: item.channel,
                p_chatwoot_conversation_id: item.chatwoot_conversation_id,
                p_attempt: item.attempt + 1,
                p_max_attempts: effectiveMaxAttempts,
                p_intervals_minutes: JSON.stringify(currentIntervals),
                p_delay_minutes: nextDelay,
              });

              console.log(`[FollowUp] Scheduled next attempt ${item.attempt + 1} in ${nextDelay}min`);
            }
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
              p_tokens_input: 0,
              p_tokens_output: 0,
              p_latency_ms: 0,
            });
          } catch (e) {
            console.warn("[FollowUp] Could not save to history:", e);
          }

          processed++;
        } else {
          console.error(`[FollowUp] ❌ Failed to send for conv ${item.conversation_id}`);
        }
      } catch (itemErr: any) {
        console.error(`[FollowUp] ❌ Error processing item ${item.id}:`, itemErr?.message || itemErr);
        // Don't let one item crash the entire batch — continue to next
      }
    }

    console.log(`[FollowUp] Done: processed=${processed}, quiet=${skippedQuiet}, inactive=${skippedInactive}, dedup=${skippedDedup}`);

    return new Response(JSON.stringify({
      processed,
      skipped_quiet_hours: skippedQuiet,
      skipped_inactive: skippedInactive,
      skipped_dedup: skippedDedup,
      total_pending: pendingItems.length,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FollowUp] Fatal error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
