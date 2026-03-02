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

export function useUsageDailySummary() {
  return useQuery({
    queryKey: ["usage-daily-summary"],
    queryFn: async () => {
      const { data, error } = await nexusDb
        .from("usage_daily_summary")
        .select("*")
        .order("day", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as UsageDailySummary[];
    },
    refetchInterval: 30000,
  });
}

export function useRecentUsageEvents(limit = 50) {
  return useQuery({
    queryKey: ["usage-events-recent", limit],
    queryFn: async () => {
      const { data, error } = await nexusDb
        .from("usage_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as UsageEvent[];
    },
    refetchInterval: 10000,
  });
}
