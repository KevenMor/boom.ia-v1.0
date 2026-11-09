/**
 * Sync etiquetas nativas do WhatsApp (WAHA) + labels CRM Mega
 * conforme o assignee da conversa AS Veículos (account 20 / inbox 71).
 *
 * Mapa:
 *  - sem assignee → ATENDIMENTO IA (Tânia)
 *  - 67 Rafael → RAFAEL
 *  - 70 Eduardo → EDUARDO
 *  - 69 Nicoly → NICOLY
 */

export const AS_VEICULOS_ACCOUNT_ID = 20;
export const AS_VEICULOS_INBOX_ID = 71;

/** Labels WAHA gerenciadas por este sync (não apaga as demais do chat). */
export const WAHA_ASSIGNEE_LABEL_IDS = {
  ia: "26",
  rafael: "22",
  eduardo: "23",
  nicoly: "27",
} as const;

export const MEGA_ASSIGNEE_LABEL_TITLES = {
  ia: "atendimento-ia",
  rafael: "rafael",
  eduardo: "eduardo",
  nicoly: "nicoly",
} as const;

const AGENT_TO_KEY: Record<number, keyof typeof WAHA_ASSIGNEE_LABEL_IDS> = {
  67: "rafael",
  70: "eduardo",
  69: "nicoly",
};

export type AssigneeLabelKey = keyof typeof WAHA_ASSIGNEE_LABEL_IDS;

/** null = assignee humano fora do mapa (só remove labels gerenciadas). */
export function resolveAssigneeLabelKey(
  assigneeId: number | null | undefined,
): AssigneeLabelKey | null {
  if (assigneeId == null) return "ia";
  return AGENT_TO_KEY[assigneeId] ?? null;
}

function wahaConfig() {
  const base = (process.env.WAHA_BASE_URL || "https://waha.atendai.app").replace(/\/+$/, "");
  const apiKey = process.env.WAHA_API_KEY || "";
  const session = process.env.AS_VEICULOS_WAHA_SESSION || "20_71_5515996809008";
  return { base, apiKey, session };
}

function megaConfig() {
  const base = (process.env.CHATWOOT_BASE_URL || "https://mega.atendai.app").replace(/\/+$/, "");
  const token =
    process.env.AS_VEICULOS_CHATWOOT_TOKEN ||
    process.env.AS_VEICULOS_MEGA_MCP_TOKEN ||
    process.env.CHATWOOT_API_TOKEN ||
    "";
  const accountId = Number(process.env.AS_VEICULOS_MEGA_ACCOUNT_ID || AS_VEICULOS_ACCOUNT_ID);
  return { base, token, accountId };
}

export function toWahaChatId(sourceId: string | null | undefined, phone?: string | null): string | null {
  const raw = String(sourceId || phone || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  return `${digits}@c.us`;
}

async function wahaFetch(path: string, method: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const { base, apiKey, session } = wahaConfig();
  if (!apiKey) return { status: 0, data: { error: "WAHA_API_KEY missing" } };
  const url = `${base}/api/${encodeURIComponent(session)}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: resp.status, data };
}

async function megaFetch(path: string, method: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const { base, token, accountId } = megaConfig();
  if (!token) return { status: 0, data: { error: "AS_VEICULOS_CHATWOOT_TOKEN missing" } };
  const url = `${base}/api/v1/accounts/${accountId}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      api_access_token: token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: resp.status, data };
}

export async function syncWahaAssigneeLabel(chatId: string, assigneeId: number | null | undefined) {
  const key = resolveAssigneeLabelKey(assigneeId);
  const targetId = key ? WAHA_ASSIGNEE_LABEL_IDS[key] : null;
  const managed = new Set<string>(Object.values(WAHA_ASSIGNEE_LABEL_IDS));

  const enc = encodeURIComponent(chatId);
  const current = await wahaFetch(`/labels/chats/${enc}`, "GET");
  const list = Array.isArray(current.data) ? (current.data as Array<{ id?: string }>) : [];
  const keep = list
    .map((l) => String(l.id || ""))
    .filter((id) => id && !managed.has(id));
  if (targetId && !keep.includes(targetId)) keep.push(targetId);

  const put = await wahaFetch(`/labels/chats/${enc}`, "PUT", {
    labels: keep.map((id) => ({ id })),
  });
  return { key, targetId, status: put.status, keep, put: put.data };
}

export async function syncMegaCrmAssigneeLabel(
  conversationId: number | string,
  assigneeId: number | null | undefined,
) {
  const key = resolveAssigneeLabelKey(assigneeId);
  const target = key ? MEGA_ASSIGNEE_LABEL_TITLES[key] : null;
  const managed = new Set<string>(Object.values(MEGA_ASSIGNEE_LABEL_TITLES));

  const current = await megaFetch(`/conversations/${conversationId}/labels`, "GET");
  const payload = (current.data as { payload?: string[] } | null)?.payload;
  const existing = Array.isArray(payload) ? payload.map(String) : [];
  const keep = existing.filter((t) => !managed.has(t));
  if (target && !keep.includes(target)) keep.push(target);

  const put = await megaFetch(`/conversations/${conversationId}/labels`, "POST", { labels: keep });
  return { key, target, status: put.status, keep, put: put.data };
}

export type MegaAssignmentPayload = {
  event?: string;
  id?: number;
  inbox_id?: number;
  account_id?: number;
  assignee_id?: number | null;
  changed_attributes?: Array<Record<string, unknown>>;
  conversation?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  contact_inbox?: { source_id?: string };
};

function extractAssigneeId(payload: MegaAssignmentPayload): number | null {
  const conv = (payload.conversation || payload) as Record<string, unknown>;
  const meta = (conv.meta || payload.meta || {}) as Record<string, unknown>;
  const assignee = meta.assignee as { id?: number } | undefined;
  if (assignee?.id != null) return Number(assignee.id);
  if (conv.assignee_id != null) return Number(conv.assignee_id);
  if (payload.assignee_id != null) return Number(payload.assignee_id);
  for (const row of payload.changed_attributes || []) {
    const a = row.assignee_id as { current_value?: number | null } | undefined;
    if (a && "current_value" in a) {
      return a.current_value == null ? null : Number(a.current_value);
    }
  }
  return null;
}

function extractConversationId(payload: MegaAssignmentPayload): number | null {
  const conv = payload.conversation as { id?: number; display_id?: number } | undefined;
  const id = conv?.id ?? payload.id;
  return id != null ? Number(id) : null;
}

function extractChatId(payload: MegaAssignmentPayload): string | null {
  const conv = (payload.conversation || payload) as Record<string, unknown>;
  const contactInbox = (conv.contact_inbox || payload.contact_inbox || {}) as { source_id?: string };
  const meta = (conv.meta || payload.meta || {}) as Record<string, unknown>;
  const sender = (meta.sender || {}) as { phone_number?: string };
  return toWahaChatId(contactInbox.source_id, sender.phone_number);
}

function assigneeChanged(payload: MegaAssignmentPayload): boolean {
  if (!payload.changed_attributes?.length) return true;
  return payload.changed_attributes.some((row) => "assignee_id" in row || "assignee" in row);
}

export async function handleAsVeiculosAssignmentWebhook(payload: MegaAssignmentPayload) {
  const event = String(payload.event || "");
  const conv = (payload.conversation || payload) as Record<string, unknown>;
  const inboxId = Number(conv.inbox_id ?? payload.inbox_id ?? 0);
  if (inboxId && inboxId !== AS_VEICULOS_INBOX_ID) {
    return { skipped: true, reason: "inbox_mismatch", inboxId };
  }
  if (
    event &&
    !["conversation_updated", "conversation_created", "conversation_status_changed"].includes(event)
  ) {
    return { skipped: true, reason: "event_ignored", event };
  }
  if (event === "conversation_updated" && !assigneeChanged(payload)) {
    return { skipped: true, reason: "assignee_unchanged" };
  }

  const conversationId = extractConversationId(payload);
  const assigneeId = extractAssigneeId(payload);
  const chatId = extractChatId(payload);
  if (!conversationId) return { skipped: true, reason: "no_conversation_id" };
  if (!chatId) return { skipped: true, reason: "no_chat_id", conversationId, assigneeId };

  const waha = await syncWahaAssigneeLabel(chatId, assigneeId);
  const mega = await syncMegaCrmAssigneeLabel(conversationId, assigneeId);
  return {
    skipped: false,
    event,
    conversationId,
    assigneeId,
    chatId,
    waha,
    mega,
  };
}
