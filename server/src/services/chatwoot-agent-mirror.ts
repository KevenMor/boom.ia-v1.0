import { buildSystemPrompt, getPromptConfig } from "./prompts/registry.js";

const SECRET_KEYS = new Set([
  "chatwoot_api_token",
  "waha_api_key",
  "sandbox_password",
  "webhook_token",
]);

export function maskSecret(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value);
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

export function sanitizeConfigForMirror(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const src = config ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (SECRET_KEYS.has(key)) {
      out[key] = maskSecret(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function configChatwootAccountId(config: Record<string, unknown> | null | undefined): string | null {
  const raw = config?.chatwoot_account_id;
  if (raw == null || raw === "") return null;
  return String(raw);
}

export function matchesChatwootAccount(
  config: Record<string, unknown> | null | undefined,
  accountId: string,
): boolean {
  const id = configChatwootAccountId(config);
  if (!id) return false;
  return id === String(accountId);
}

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

type AgentRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  avatar_url: string | null;
  tenant_id: string;
  provider_id: string | null;
  model: string | null;
  temperature: number;
  system_prompt: string | null;
  webhook_token: string | null;
  config: Record<string, unknown> | null;
  updated_at: string | null;
  tenants?: { name?: string | null; slug?: string | null } | null;
  providers?: { name?: string | null } | null;
};

export function buildWebhookUrl(apiPublicBase: string, agentId: string): string | null {
  const base = apiPublicBase.replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/webhooks?agent_id=${agentId}`;
}

function resolveRegistryPrompt(tenantSlug: string | null | undefined): MirrorPromptInfo {
  const slug = tenantSlug?.trim() || null;
  if (!slug) {
    return {
      slug: null,
      version: null,
      description: null,
      uses_registry: false,
      composed_prompt_preview: null,
    };
  }
  try {
    const cfg = getPromptConfig(slug);
    if (!cfg) {
      return {
        slug,
        version: null,
        description: null,
        uses_registry: false,
        composed_prompt_preview: null,
      };
    }
    const composed = buildSystemPrompt("", slug, false);
    const preview =
      composed.length > 4000 ? `${composed.slice(0, 4000)}\n\n… [${composed.length - 4000} caracteres omitidos]` : composed;
    return {
      slug,
      version: cfg.version ?? null,
      description: cfg.description ?? null,
      uses_registry: true,
      composed_prompt_preview: preview,
    };
  } catch {
    return {
      slug,
      version: null,
      description: null,
      uses_registry: false,
      composed_prompt_preview: null,
    };
  }
}

export function buildAgentMirrorPayload(
  agent: AgentRow,
  tools: MirrorToolRow[],
  apiPublicBase: string,
): AgentMirrorPayload {
  const tenantSlug = agent.tenants?.slug ?? null;
  const sanitized = sanitizeConfigForMirror(agent.config);
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: agent.status,
    avatar_url: agent.avatar_url,
    tenant_id: agent.tenant_id,
    tenant_name: agent.tenants?.name ?? null,
    tenant_slug: tenantSlug,
    provider_id: agent.provider_id,
    provider_name: agent.providers?.name ?? null,
    model: agent.model,
    temperature: agent.temperature,
    system_prompt: agent.system_prompt,
    webhook_url: buildWebhookUrl(apiPublicBase, agent.id),
    config: sanitized,
    tools,
    prompt: resolveRegistryPrompt(tenantSlug),
    updated_at: agent.updated_at,
  };
}
