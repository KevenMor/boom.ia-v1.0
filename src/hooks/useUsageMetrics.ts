import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export interface UsageDailySummary {
  day: string;
  tenant_id: string;
  agent_id: string;
  model: string;
  phase: string;
  total_requests: number;
  sum_prompt: number;
  sum_completion: number;
  sum_tokens: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  sum_tool_calls: number;
}

export interface UsageEvent {
  id: string;
  tenant_id: string;
  agent_id: string;
  conversation_id: string | null;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  tool_calls_count: number;
  phase: string;
  created_at: string;
}

export function useUsageDailySummary(tenantId?: string | null) {
  return useQuery({
    queryKey: ["usage-daily-summary", tenantId ?? "all"],
    queryFn: async () => {
      let query = nexusDb
        .from("usage_daily_summary")
        .select("*")
        .order("day", { ascending: false })
        .limit(500);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as UsageDailySummary[];
    },
    refetchInterval: 30000,
  });
}

export function useRecentUsageEvents(limit = 200, tenantId?: string | null) {
  return useQuery({
    queryKey: ["usage-events-recent", limit, tenantId ?? "all"],
    queryFn: async () => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      let query = nexusDb
        .from("usage_events")
        .select("*")
        .gte("created_at", twoDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as UsageEvent[];
    },
    refetchInterval: 10000,
  });
}
