import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export interface ProviderTokenSummary {
  provider: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_requests: number;
}

export function useTokensByProvider(tenantId?: string | null) {
  return useQuery({
    queryKey: ["tokens-by-provider", tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      let query = nexusDb
        .from("agent_token_usage")
        .select("agent_id, provider, prompt_tokens, completion_tokens, total_tokens")
        .gte("created_at", since.toISOString())
        .limit(10000);

      const { data: rows, error } = await query;
      if (error) throw error;

      const usage = rows ?? [];
      if (usage.length === 0) return [] as ProviderTokenSummary[];

      if (tenantId) {
        const agentIds = [...new Set(usage.map((r: { agent_id: string }) => r.agent_id).filter(Boolean))];
        const { data: agents } = await nexusDb
          .from("agents")
          .select("id, tenant_id")
          .in("id", agentIds);
        const tenantAgentIds = new Set(
          (agents ?? []).filter((a: { tenant_id: string }) => a.tenant_id === tenantId).map((a: { id: string }) => a.id)
        );
        if (tenantAgentIds.size > 0) {
          const filtered = usage.filter((r: { agent_id: string }) => tenantAgentIds.has(r.agent_id));
          return aggregateByProvider(filtered);
        }
      }

      return aggregateByProvider(usage);
    },
    refetchInterval: 30000,
  });
}

function aggregateByProvider(rows: Array<{ provider?: string; prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }>): ProviderTokenSummary[] {
  const byProvider = new Map<string, ProviderTokenSummary>();
  for (const row of rows) {
    const key = row.provider || "unknown";
    const existing = byProvider.get(key) || {
      provider: key,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_requests: 0,
    };
    existing.total_tokens += row.total_tokens ?? (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0);
    existing.prompt_tokens += row.prompt_tokens ?? 0;
    existing.completion_tokens += row.completion_tokens ?? 0;
    existing.total_requests += 1;
    byProvider.set(key, existing);
  }
  return Array.from(byProvider.values()).sort((a, b) => b.total_tokens - a.total_tokens);
}
