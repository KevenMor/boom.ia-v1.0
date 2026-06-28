import { SECRET_KEYS, maskSecret } from "./chatwoot-agent-mirror.js";

export function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("••••");
}

export function mergeConfigForEmbedUpdate(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const base = { ...(current ?? {}) };
  const patch = incoming ?? {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (SECRET_KEYS.has(key) && isMaskedSecret(value)) continue;
    if (value === "" && SECRET_KEYS.has(key)) continue;
    base[key] = value;
  }
  return base;
}

export interface EmbedAgentUpdateBody {
  name?: string;
  description?: string | null;
  status?: string;
  avatar_url?: string | null;
  provider_id?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  temperature?: number;
  config?: Record<string, unknown>;
}

const ALLOWED_STATUS = new Set(["active", "test", "inactive"]);

export function normalizeEmbedAgentUpdate(body: EmbedAgentUpdateBody): {
  row: Record<string, unknown>;
  config: Record<string, unknown> | undefined;
} {
  const row: Record<string, unknown> = {};
  if (body.name != null) row.name = String(body.name).trim();
  if (body.description !== undefined) row.description = body.description;
  if (body.status != null) {
    const s = String(body.status);
    if (!ALLOWED_STATUS.has(s)) throw new Error("status inválido");
    row.status = s;
  }
  if (body.avatar_url !== undefined) row.avatar_url = body.avatar_url;
  if (body.provider_id !== undefined) row.provider_id = body.provider_id || null;
  if (body.model !== undefined) row.model = body.model || null;
  if (body.system_prompt !== undefined) row.system_prompt = body.system_prompt || null;
  if (body.temperature != null) row.temperature = Number(body.temperature);
  return { row, config: body.config };
}

export function sanitizeIncomingConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.has(key) && typeof value === "string" && value.includes("•")) {
      out[key] = maskSecret(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
