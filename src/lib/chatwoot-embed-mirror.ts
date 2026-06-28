export interface MirrorToolRow {
  id: string;
  name: string;
  tool_type: string;
  description: string | null;
}

export interface MirrorPromptInfo {
  slug: string | null;
  version: string | null;
  description: string | null;
  uses_registry: boolean;
  composed_prompt_preview: string | null;
}

export interface AgentMirrorPayload {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
  tenant_id: string;
  tenant_name: string | null;
  tenant_slug: string | null;
  provider_id: string | null;
  provider_name: string | null;
  model: string | null;
  temperature: number;
  system_prompt: string | null;
  webhook_url: string | null;
  config: Record<string, unknown>;
  tools: MirrorToolRow[];
  prompt: MirrorPromptInfo;
  updated_at: string | null;
}

export interface MirrorProviderRow {
  id: string;
  name: string;
}

export interface ChatwootMirrorResponse {
  account_id: string;
  agents: AgentMirrorPayload[];
  providers?: MirrorProviderRow[];
  generated_at?: string;
  message?: string;
}

export function parseChatwootAccountIdFromMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    if (typeof data === "string") {
      try {
        return parseChatwootAccountIdFromMessage(JSON.parse(data));
      } catch {
        return null;
      }
    }
    return null;
  }

  const obj = data as Record<string, unknown>;
  const candidates: unknown[] = [
    obj.account_id,
    (obj.data as Record<string, unknown> | undefined)?.account_id,
    (obj.conversation as Record<string, unknown> | undefined)?.account_id,
    (obj.currentAgent as Record<string, unknown> | undefined)?.account_id,
    ((obj.data as Record<string, unknown> | undefined)?.conversation as Record<string, unknown> | undefined)
      ?.account_id,
  ];

  for (const c of candidates) {
    if (c != null && c !== "") return String(c);
  }
  return null;
}

export async function fetchChatwootAgentMirror(
  accountId: string,
  embedKey: string,
  apiBase = "/api",
): Promise<ChatwootMirrorResponse> {
  const base = apiBase.replace(/\/+$/, "");
  const params = new URLSearchParams({
    account_id: accountId,
    key: embedKey,
  });
  const res = await fetch(`${base}/embed/chatwoot/agents?${params.toString()}`, {
    headers: { "x-chatwoot-mirror-key": embedKey },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & ChatwootMirrorResponse;
  if (!res.ok) {
    throw new Error(body.error || `Erro ${res.status} ao carregar espelho do agente`);
  }
  return body;
}

export async function updateChatwootAgentEmbed(
  agentId: string,
  accountId: string,
  embedKey: string,
  payload: Record<string, unknown>,
  apiBase = "/api",
): Promise<AgentMirrorPayload> {
  const base = apiBase.replace(/\/+$/, "");
  const params = new URLSearchParams({
    account_id: accountId,
    key: embedKey,
  });
  const res = await fetch(`${base}/embed/chatwoot/agents/${encodeURIComponent(agentId)}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-chatwoot-mirror-key": embedKey,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; agent?: AgentMirrorPayload };
  if (!res.ok) {
    throw new Error(body.error || `Erro ${res.status} ao salvar agente`);
  }
  if (!body.agent) throw new Error("Resposta inválida ao salvar agente");
  return body.agent;
}
