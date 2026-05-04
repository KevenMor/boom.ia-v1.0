/**
 * Envia notificação para grupo/conversa no Chatwoot.
 * Usado por chat-local (agendamento, handoff) e tool-executor (enviar_notificacao).
 */
import { createNexusClient } from "../services/supabase.js";
import { getChatwootAuthHeaders } from "../services/delivery.js";

export async function sendNotificationToGroup(
  agentId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createNexusClient();
  try {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, config")
      .eq("id", agentId)
      .single();

    if (!agent?.config) {
      return { success: false, error: "Agente não encontrado" };
    }

    const { data: notifTools } = await supabase
      .from("tools")
      .select("id, tool_type, execution_config")
      .eq("tool_type", "send_notification")
      .limit(10);

    if (!notifTools || notifTools.length === 0) {
      return { success: false, error: "Nenhuma tool send_notification encontrada" };
    }

    const { data: agentToolLinks } = await supabase
      .from("agent_tools")
      .select("tool_id")
      .eq("agent_id", agentId);
    const linkedToolIds = new Set((agentToolLinks || []).map((l: { tool_id: string }) => l.tool_id));

    const notifTool = notifTools.find((t: { id: string }) => linkedToolIds.has(t.id)) || notifTools[0];
    const execCfg = (notifTool.execution_config || {}) as Record<string, unknown>;
    const targetConvId = execCfg.conversation_id;

    if (!targetConvId) {
      return { success: false, error: "Tool send_notification sem conversation_id configurado" };
    }

    const cfg = (agent.config || {}) as Record<string, string>;
    const cwUrl = cfg.chatwoot_url;
    const cwToken = cfg.chatwoot_api_token;
    const cwAccountId = cfg.chatwoot_account_id;

    if (!cwUrl || !cwToken || !cwAccountId) {
      return { success: false, error: "Chatwoot não configurado no agente" };
    }

    const baseUrl = cwUrl.replace(/\/+$/, "");
    const msgUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${targetConvId}/messages`;
    const cwAuth = getChatwootAuthHeaders(cwToken, cfg);

    const resp = await fetch(msgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cwAuth },
      body: JSON.stringify({ content: message, message_type: "outgoing", private: false }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[SendNotification] Falhou:", resp.status, errText);
      return { success: false, error: `Chatwoot ${resp.status}: ${errText.slice(0, 100)}` };
    }
    console.log("[SendNotification] Enviada com sucesso para conversa", targetConvId);
    return { success: true };
  } catch (e) {
    const err = e as Error;
    console.warn("[SendNotification] Erro:", err?.message);
    return { success: false, error: err?.message || "Erro ao enviar notificação" };
  }
}
