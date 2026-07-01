import type { SupabaseClient } from "@supabase/supabase-js";
import { matchesChatwootAccount } from "./chatwoot-agent-mirror.js";
import { buildChatwootConversationUrl } from "../utils/chatwoot-conversation-url.js";
import {
  crmPhoneMatches,
  isValidCrmPhone,
  normalizeBrazilPhoneDigits,
} from "../utils/crm-phone-match.js";

type AgentRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  tenant_id: string;
  config: Record<string, unknown> | null;
};

export type ResolvedContactConversation = {
  nexusConversationId: string | null;
  agentId: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
  chatwootConversationId: number | null;
  chatwootAccountId: string | null;
  chatwootBaseUrl: string | null;
};

function hasChatwootConfig(cfg: Record<string, unknown> | null | undefined): boolean {
  const c = cfg ?? {};
  return !!(c.chatwoot_url && c.chatwoot_api_token && c.chatwoot_account_id);
}

function pickChatwootAgent(
  agents: AgentRow[],
  tenantId: string,
  preferredAccountId?: string | null,
): AgentRow | null {
  const tenantAgents = agents.filter((a) => a.tenant_id === tenantId);
  if (preferredAccountId) {
    const matched = tenantAgents.find((a) => matchesChatwootAccount(a.config, preferredAccountId));
    if (matched && hasChatwootConfig(matched.config)) return matched;
  }
  return tenantAgents.find((a) => hasChatwootConfig(a.config)) ?? null;
}

async function findInNexus(
  supabase: SupabaseClient,
  tenantId: string,
  phoneNorm: string,
): Promise<ResolvedContactConversation | null> {
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, avatar_url, tenant_id, config")
    .eq("tenant_id", tenantId);

  let best: ResolvedContactConversation | null = null;

  for (const agent of (agents ?? []) as AgentRow[]) {
    const { data: convs } = await supabase.rpc("list_agent_conversations", {
      p_agent_id: agent.id,
      p_limit: 500,
    });

    for (const c of (convs ?? []) as Array<{
      id: string;
      external_user_id: string | null;
      chatwoot_conversation_id: number | null;
    }>) {
      const extDigits = (c.external_user_id ?? "").replace(/\D/g, "");
      if (!crmPhoneMatches(phoneNorm, extDigits)) continue;

      const cfg = (agent.config ?? {}) as Record<string, unknown>;
      const accountId = cfg.chatwoot_account_id != null ? String(cfg.chatwoot_account_id) : null;
      const row: ResolvedContactConversation = {
        nexusConversationId: c.id,
        agentId: agent.id,
        agentName: agent.name,
        agentAvatarUrl: agent.avatar_url ?? null,
        chatwootConversationId: c.chatwoot_conversation_id,
        chatwootAccountId: accountId,
        chatwootBaseUrl: hasChatwootConfig(cfg) ? String(cfg.chatwoot_url).replace(/\/+$/, "") : null,
      };

      if (!best) {
        best = row;
        continue;
      }
      if (c.chatwoot_conversation_id != null && best.chatwootConversationId == null) {
        best = row;
      }
    }
  }

  return best;
}

async function searchChatwootContactId(
  baseUrl: string,
  accountId: string,
  apiToken: string,
  phoneNorm: string,
): Promise<number | null> {
  const queries = [`+${phoneNorm}`, phoneNorm];
  const suffix = phoneNorm.length >= 9 ? phoneNorm.slice(-9) : null;
  if (suffix) queries.push(suffix);

  for (const q of queries) {
    try {
      const resp = await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(q)}`,
        { headers: { api_access_token: apiToken } },
      );
      if (!resp.ok) continue;
      const data = (await resp.json()) as { payload?: Array<{ id?: number; phone_number?: string }> };
      const payload = Array.isArray(data.payload) ? data.payload : [];
      for (const item of payload) {
        if (typeof item.id !== "number") continue;
        if (crmPhoneMatches(phoneNorm, item.phone_number ?? "")) return item.id;
      }
      const first = payload[0]?.id;
      if (typeof first === "number") return first;
    } catch {
      /* próxima variante */
    }
  }
  return null;
}

async function findLatestChatwootConversationId(
  baseUrl: string,
  accountId: string,
  apiToken: string,
  chatwootContactId: number,
): Promise<number | null> {
  try {
    const resp = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/${chatwootContactId}/conversations`,
      { headers: { api_access_token: apiToken } },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      payload?: Array<{ id?: number; last_activity_at?: number; created_at?: number }>;
    };
    const list = Array.isArray(data.payload) ? data.payload : [];
    if (list.length === 0) return null;
    list.sort((a, b) => {
      const ta = Number(a.last_activity_at ?? a.created_at ?? 0);
      const tb = Number(b.last_activity_at ?? b.created_at ?? 0);
      return tb - ta;
    });
    const id = list[0]?.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

async function findViaChatwootApi(
  supabase: SupabaseClient,
  tenantId: string,
  phoneNorm: string,
  preferredAccountId?: string | null,
): Promise<ResolvedContactConversation | null> {
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, avatar_url, tenant_id, config")
    .eq("tenant_id", tenantId);

  const agent = pickChatwootAgent((agents ?? []) as AgentRow[], tenantId, preferredAccountId);
  if (!agent) return null;

  const cfg = (agent.config ?? {}) as Record<string, unknown>;
  const baseUrl = String(cfg.chatwoot_url ?? "").replace(/\/+$/, "");
  const apiToken = String(cfg.chatwoot_api_token ?? "");
  const accountId = String(preferredAccountId ?? cfg.chatwoot_account_id ?? "");
  if (!baseUrl || !apiToken || !accountId) return null;

  const chatwootContactId = await searchChatwootContactId(baseUrl, accountId, apiToken, phoneNorm);
  if (!chatwootContactId) return null;

  const chatwootConversationId = await findLatestChatwootConversationId(
    baseUrl,
    accountId,
    apiToken,
    chatwootContactId,
  );
  if (!chatwootConversationId) return null;

  return {
    nexusConversationId: null,
    agentId: agent.id,
    agentName: agent.name,
    agentAvatarUrl: agent.avatar_url ?? null,
    chatwootConversationId,
    chatwootAccountId: accountId,
    chatwootBaseUrl: baseUrl,
  };
}

export async function resolveContactConversation(
  supabase: SupabaseClient,
  tenantId: string,
  phoneRaw: string | null | undefined,
  opts?: { preferredAccountId?: string | null },
): Promise<ResolvedContactConversation | null> {
  const digits = (phoneRaw ?? "").replace(/\D/g, "");
  if (!isValidCrmPhone(digits)) return null;
  const phoneNorm = normalizeBrazilPhoneDigits(digits);

  const fromNexus = await findInNexus(supabase, tenantId, phoneNorm);
  if (fromNexus?.chatwootConversationId != null) return fromNexus;

  const fromApi = await findViaChatwootApi(supabase, tenantId, phoneNorm, opts?.preferredAccountId);
  if (fromApi) {
    if (fromNexus && !fromApi.nexusConversationId) {
      return { ...fromApi, nexusConversationId: fromNexus.nexusConversationId };
    }
    return fromApi;
  }

  return fromNexus;
}

export type ContactConversationPreviewPayload = {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    model?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  chatwoot_url: string | null;
  chatwoot_conversation_id: number | null;
  chatwoot_account_id: string | null;
  agent_name: string | null;
  agent_avatar_url: string | null;
};

const EMPTY_PREVIEW: ContactConversationPreviewPayload = {
  messages: [],
  chatwoot_url: null,
  chatwoot_conversation_id: null,
  chatwoot_account_id: null,
  agent_name: null,
  agent_avatar_url: null,
};

export async function buildContactConversationPreview(
  supabase: SupabaseClient,
  contact: { id: string; tenant_id: string; phone: string | null },
  opts?: { preferredAccountId?: string | null; relativeChatwootUrl?: boolean },
): Promise<ContactConversationPreviewPayload> {
  const resolved = await resolveContactConversation(supabase, contact.tenant_id, contact.phone, {
    preferredAccountId: opts?.preferredAccountId,
  });

  if (!resolved) return EMPTY_PREVIEW;

  let messages: ContactConversationPreviewPayload["messages"] = [];
  if (resolved.nexusConversationId && resolved.agentId) {
    const { data: msgs } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: resolved.agentId,
      p_conversation_id: resolved.nexusConversationId,
      p_limit: 80,
    });
    messages = (msgs ?? []) as ContactConversationPreviewPayload["messages"];
  }

  const accountId = opts?.preferredAccountId ?? resolved.chatwootAccountId;
  const chatwootUrl =
    resolved.chatwootConversationId && accountId
      ? buildChatwootConversationUrl(
          opts?.relativeChatwootUrl ? null : resolved.chatwootBaseUrl,
          accountId,
          resolved.chatwootConversationId,
          opts?.relativeChatwootUrl ? { relative: true } : undefined,
        )
      : null;

  return {
    messages,
    chatwoot_url: chatwootUrl,
    chatwoot_conversation_id: resolved.chatwootConversationId,
    chatwoot_account_id: accountId,
    agent_name: resolved.agentName,
    agent_avatar_url: resolved.agentAvatarUrl,
  };
}
