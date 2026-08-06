import { nexusDb } from "@/integrations/supabase/nexus-client";

/** `.in('agent_id', …)` grande quebra POST/URL — fatiar igual ao PostgREST. */
const AGENT_ID_CHUNK_SIZE = 100;

export function chunkIds<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const s = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += s) out.push(items.slice(i, i + s) as T[]);
  return out;
}

export async function fetchAgentIdsForTenant(tenantId: string): Promise<string[]> {
  const { data, error } = await nexusDb.from("agents").select("id").eq("tenant_id", tenantId);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
}

/** Agrega mapa agent_id → tenant_id; fatia `.in()` se necessário. */
export async function fetchAgentTenantMap(agentIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (agentIds.length === 0) return map;
  for (const chunk of chunkIds(agentIds, AGENT_ID_CHUNK_SIZE)) {
    const { data, error } = await nexusDb.from("agents").select("id, tenant_id").in("id", chunk);
    if (error) throw error;
    for (const a of data ?? []) {
      map.set((a as { id: string }).id, ((a as { tenant_id?: string }).tenant_id ?? ""));
    }
  }
  return map;
}

export type FetchTokenUsageOpts = {
  columns: string;
  /** Somente modo “todos os tenants”: teto nas linhas mais recentes. */
  globalLimit?: number;
  limit?: number;
};

/**
 * Com `tenantId`, só usa linhas cujo agente pertence a esse tenant — sem amostrar
 * primeiro os N eventos mais recentes de todo o cluster (que distorce KPI).
 */
export async function fetchAgentTokenUsageInRange(
  since: Date,
  tenantId: string | null | undefined,
  opts: FetchTokenUsageOpts,
): Promise<Record<string, unknown>[]> {
  const sinceIso = since.toISOString();

  if (tenantId) {
    const ids = await fetchAgentIdsForTenant(tenantId);
    if (ids.length === 0) return [];
    const merged: Record<string, unknown>[] = [];
    const chunkLimit = opts.limit;
    for (const chunk of chunkIds(ids, AGENT_ID_CHUNK_SIZE)) {
      let query = nexusDb
        .from("agent_token_usage")
        .select(opts.columns)
        .in("agent_id", chunk)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false });
      if (chunkLimit !== undefined) {
        query = query.limit(chunkLimit);
      }
      const { data, error } = await query;
      if (error) throw error;
      merged.push(...(data ?? []));
    }
    return merged;
  }

  const limit = opts.limit ?? opts.globalLimit ?? 80_000;
  const { data, error } = await nexusDb
    .from("agent_token_usage")
    .select(opts.columns)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
