import { useQuery } from "@tanstack/react-query";
import { fetchAgentTokenUsageInRange } from "@/lib/fetch-agent-token-usage";

export interface ProviderTokenSummary {
  provider: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_requests: number;
}

const TOKEN_ROWS_PROVIDER = "agent_id, provider, prompt_tokens, completion_tokens, total_tokens";

export function useTokensByProvider(tenantId?: string | null) {
  return useQuery({
    queryKey: ["tokens-by-provider", tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const raw = await fetchAgentTokenUsageInRange(since, tenantId, {
        columns: TOKEN_ROWS_PROVIDER,
        globalLimit: 80_000,
      });

      const usage = raw as Array<{
        agent_id: string;
        provider?: string;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }>;

      if (usage.length === 0) return [] as ProviderTokenSummary[];

      return aggregateByProvider(usage);
    },
    refetchInterval: 30000,
  });
}

function aggregateByProvider(
  rows: Array<{ provider?: string; prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }>,
): ProviderTokenSummary[] {
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
