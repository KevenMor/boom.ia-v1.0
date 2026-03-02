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
      let query = nexusDb
        .from("usage_events")
        .select("provider, prompt_tokens, completion_tokens, total_tokens");

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query.limit(10000);
      if (error) throw error;

      const byProvider = new Map<string, ProviderTokenSummary>();
      for (const row of data ?? []) {
        const key = row.provider || "unknown";
        const existing = byProvider.get(key) || {
          provider: key,
          total_tokens: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_requests: 0,
        };
        existing.total_tokens += row.total_tokens || 0;
        existing.prompt_tokens += row.prompt_tokens || 0;
        existing.completion_tokens += row.completion_tokens || 0;
        existing.total_requests += 1;
        byProvider.set(key, existing);
      }

      return Array.from(byProvider.values()).sort((a, b) => b.total_tokens - a.total_tokens);
    },
    refetchInterval: 30000,
  });
}
