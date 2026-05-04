import type { SupabaseClient } from "@supabase/supabase-js";
import { applyJitter, getChatwootAuthHeaders } from "./delivery.js";
import { sendViaWaha } from "./waha.js";

export interface FinanceiroCampaignContact {
  name: string;
  phone: string;
  value: string;
  due_date: string;
  status?: string;
}

export type FinanceiroDeliveryChannel = "waha" | "chatwoot";

export interface FinanceiroCampaignResultItem {
  index: number;
  name: string;
  phone: string;
  ok: boolean;
  error?: string;
  channel: FinanceiroDeliveryChannel;
}

export interface FinanceiroCampaignResult {
  total: number;
  sent: number;
  failed: number;
  delivery: FinanceiroDeliveryChannel;
  results: FinanceiroCampaignResultItem[];
}

export interface FinanceiroCampaignProgress {
  index: number;
  total: number;
  sent: number;
  failed: number;
}

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55") && digits.length <= 11) return `55${digits}`;
  return digits;
}

/** PostgREST pode devolver UUID como string ou como array de um elemento (igual webhooks.ts). */
function normalizeRpcConversationId(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string" && data.length > 0) return data;
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === "string" && first.length > 0) return first;
    return null;
  }
  return null;
}

function renderMessage(template: string, contact: FinanceiroCampaignContact): string {
  return template
    .replaceAll("{nome}", String(contact.name || "").trim() || "Cliente")
    .replaceAll("{valor}", String(contact.value || "").trim() || "0,00")
    .replaceAll("{vencimento}", String(contact.due_date || "").trim() || "--/--/----");
}

function safeDelay(minMs: number, maxMs: number): Promise<void> {
  const boundedMin = Math.max(0, Number.isFinite(minMs) ? minMs : 0);
  const boundedMax = Math.max(boundedMin, Number.isFinite(maxMs) ? maxMs : boundedMin);
  const randomBetween =
    boundedMin === boundedMax
      ? boundedMin
      : Math.round(boundedMin + Math.random() * (boundedMax - boundedMin));
  const waitMs = applyJitter(randomBetween);
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function getOrCreateChatwootContact(params: {
  baseUrl: string;
  accountId: number;
  authHeaders: Record<string, string>;
  inboxId: number;
  phone: string;
  name: string;
}): Promise<number> {
  const { baseUrl, accountId, authHeaders, inboxId, phone, name } = params;
  const phoneWithPlus = `+${phone}`;

  const searchResp = await fetch(
    `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneWithPlus)}`,
    { headers: authHeaders }
  );
  if (searchResp.ok) {
    const searchData = await searchResp.json();
    const payload = Array.isArray(searchData?.payload) ? searchData.payload : [];
    const firstId = payload[0]?.id;
    if (typeof firstId === "number") return firstId;
  }

  const createResp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      name: name || phoneWithPlus,
      phone_number: phoneWithPlus,
      inbox_id: inboxId,
    }),
  });
  if (!createResp.ok) {
    throw new Error(`chatwoot_contact_create_failed_${createResp.status}`);
  }
  const createData = await createResp.json();
  const contactId = createData?.payload?.contact?.id || createData?.payload?.id || createData?.id;
  if (typeof contactId !== "number") {
    throw new Error("chatwoot_contact_id_invalid");
  }
  return contactId;
}

async function createConversationWithMessage(params: {
  baseUrl: string;
  accountId: number;
  authHeaders: Record<string, string>;
  inboxId: number;
  contactId: number;
  content: string;
}): Promise<number> {
  const { baseUrl, accountId, authHeaders, inboxId, contactId, content } = params;
  const resp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      contact_id: contactId,
      status: "open",
      inbox_id: inboxId,
      message: { content: content.trim() },
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`chatwoot_conversation_create_failed_${resp.status}:${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const conversationId = data?.id || data?.payload?.id;
  if (typeof conversationId !== "number") {
    throw new Error("chatwoot_conversation_id_invalid");
  }
  return conversationId;
}

export async function runFinanceiroCampaign(params: {
  supabase: SupabaseClient;
  agentId: string;
  agentConfig: Record<string, unknown>;
  contacts: FinanceiroCampaignContact[];
  messageTemplate: string;
  delayMinMs: number;
  delayMaxMs: number;
  inboxOverride?: number;
  onProgress?: (p: FinanceiroCampaignProgress) => void | Promise<void>;
}): Promise<FinanceiroCampaignResult> {
  const {
    supabase,
    agentId,
    agentConfig: cfg,
    contacts,
    messageTemplate,
    delayMinMs,
    delayMaxMs,
    inboxOverride,
    onProgress,
  } = params;

  const wahaUrl = String(cfg.waha_url || "").replace(/\/+$/, "").trim();
  const wahaApiKey = String(cfg.waha_api_key || "").trim();
  const wahaSessionRaw = String(cfg.waha_session ?? "").trim();
  const wahaSession = wahaSessionRaw || "default";

  const chatwootUrl = String(cfg.chatwoot_url || "").replace(/\/+$/, "");
  const chatwootApiToken = String(cfg.chatwoot_api_token || "");
  const accountId = Number(cfg.chatwoot_account_id || 0);
  const rawInbox =
    inboxOverride !== undefined && inboxOverride !== null && String(inboxOverride).trim() !== ""
      ? inboxOverride
      : cfg.chatwoot_inbox_id;
  const inboxId = Number(rawInbox);

  const hasWaha = Boolean(wahaUrl && wahaApiKey);
  const hasChatwoot = Boolean(chatwootUrl && chatwootApiToken && accountId);

  if (!hasWaha && !hasChatwoot) {
    throw new Error(
      "Agente sem canal de envio: configure WAHA (waha_url + waha_api_key) ou Chatwoot (url, token, account_id)."
    );
  }

  const delivery: FinanceiroDeliveryChannel = hasWaha ? "waha" : "chatwoot";

  let authHeaders: Record<string, string> = {};
  if (!hasWaha) {
    if (!Number.isFinite(inboxId) || inboxId <= 0) {
      throw new Error(
        "Inbox ID do Chatwoot ausente ou invalido. Configure chatwoot_inbox_id no agente."
      );
    }
    authHeaders = getChatwootAuthHeaders(chatwootApiToken, cfg);
  }

  const results: FinanceiroCampaignResultItem[] = [];
  let sent = 0;

  const saveAttemptToConversation = async (saveParams: {
    phone: string;
    name: string;
    content: string;
    channel: FinanceiroDeliveryChannel;
    ok: boolean;
    error?: string;
  }): Promise<void> => {
    try {
      const { data: convRaw, error: findErr } = await supabase.rpc("find_or_create_webhook_conversation", {
        p_agent_id: agentId,
        p_channel: "whatsapp",
        p_external_user_id: saveParams.phone,
        p_chatwoot_conversation_id: null,
        p_chatwoot_contact_id: null,
        p_contact_name: saveParams.name?.trim() || null,
        p_contact_avatar_url: null,
        p_chatwoot_assignee_name: null,
      });
      if (findErr) {
        console.warn("[FinanceiroCampaign] find_or_create_webhook_conversation:", findErr.message);
        return;
      }
      const conversationId = normalizeRpcConversationId(convRaw);
      if (!conversationId) {
        console.warn("[FinanceiroCampaign] conversation id ausente apos find_or_create", { convRaw });
        return;
      }
      const persistedContent = saveParams.ok
        ? saveParams.content
        : `[ENVIO_FALHOU] ${saveParams.content}`;
      const { error: saveErr } = await supabase.rpc("save_message", {
        p_agent_id: agentId,
        p_conversation_id: conversationId,
        p_role: "assistant",
        p_content: persistedContent,
        p_model: null,
        p_tokens_input: 0,
        p_tokens_output: 0,
        p_latency_ms: null,
        p_metadata: {
          source: "financeiro_campaign",
          sent: saveParams.ok,
          channel: saveParams.channel,
          error: saveParams.error ?? null,
        },
      });
      if (saveErr) {
        console.warn("[FinanceiroCampaign] save_message:", saveErr.message);
      }
    } catch (e) {
      console.warn("[FinanceiroCampaign] historico (excecao):", e instanceof Error ? e.message : e);
    }
  };

  const emitProgress = async (index: number) => {
    const failed = results.filter((r) => !r.ok).length;
    await onProgress?.({
      index,
      total: contacts.length,
      sent,
      failed,
    });
  };

  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i]!;
    const normalizedPhone = normalizePhone(contact.phone);
    const name = String(contact.name || "").trim();

    if (!normalizedPhone) {
      results.push({
        index: i,
        name,
        phone: String(contact.phone || ""),
        ok: false,
        error: "phone_invalid",
        channel: delivery,
      });
      await emitProgress(i);
      continue;
    }

    const content = renderMessage(messageTemplate, contact);

    if (hasWaha) {
      const wahaResult = await sendViaWaha(wahaUrl, wahaApiKey, wahaSession, normalizedPhone, content);
      if (wahaResult.ok) {
        sent += 1;
        results.push({ index: i, name, phone: normalizedPhone, ok: true, channel: "waha" });
        await saveAttemptToConversation({
          phone: normalizedPhone,
          name,
          content,
          channel: "waha",
          ok: true,
        });
      } else {
        const errMsg = (wahaResult.error || "waha_send_failed").slice(0, 500);
        results.push({
          index: i,
          name,
          phone: normalizedPhone,
          ok: false,
          error: `waha:${errMsg}`,
          channel: "waha",
        });
        await saveAttemptToConversation({
          phone: normalizedPhone,
          name,
          content,
          channel: "waha",
          ok: false,
          error: `waha:${errMsg}`,
        });
      }
    } else {
      try {
        const contactId = await getOrCreateChatwootContact({
          baseUrl: chatwootUrl,
          accountId,
          authHeaders,
          inboxId,
          phone: normalizedPhone,
          name,
        });
        await createConversationWithMessage({
          baseUrl: chatwootUrl,
          accountId,
          authHeaders,
          inboxId,
          contactId,
          content,
        });
        sent += 1;
        results.push({ index: i, name, phone: normalizedPhone, ok: true, channel: "chatwoot" });
        await saveAttemptToConversation({
          phone: normalizedPhone,
          name,
          content,
          channel: "chatwoot",
          ok: true,
        });
      } catch (error) {
        const errText = error instanceof Error ? error.message : "unknown_error";
        results.push({
          index: i,
          name,
          phone: normalizedPhone,
          ok: false,
          error: errText,
          channel: "chatwoot",
        });
        await saveAttemptToConversation({
          phone: normalizedPhone,
          name,
          content,
          channel: "chatwoot",
          ok: false,
          error: errText,
        });
      }
    }

    await emitProgress(i);

    if (i < contacts.length - 1) {
      await safeDelay(delayMinMs, delayMaxMs);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  return {
    total: contacts.length,
    sent,
    failed,
    delivery,
    results,
  };
}
