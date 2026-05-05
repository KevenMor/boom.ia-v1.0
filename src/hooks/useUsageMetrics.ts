import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { fetchAgentTenantMap, fetchAgentTokenUsageInRange } from "@/lib/fetch-agent-token-usage";

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

interface AgentTokenUsageRow {
  id: string;
  created_at: string;
  agent_id: string;
  conversation_id: string | null;
  message_role: string;
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  metadata: Record<string, unknown> | null;
}

const USAGE_SELECT_FULL =
  "id, created_at, agent_id, conversation_id, message_role, model, provider, prompt_tokens, completion_tokens, total_tokens, metadata";

function extractToolCallsCount(metadata: Record<string, unknown> | null, messageRole: string): number {
  if (!metadata) return 0;
  const dispatcher = metadata.dispatcher as Record<string, unknown> | undefined;
  if (messageRole === "dual_provider" && dispatcher && typeof dispatcher === "object") return 1;
  return 0;
}

export function useUsageDailySummary(tenantId?: string | null) {
  return useQuery({
    queryKey: ["usage-daily-summary", tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const raw = await fetchAgentTokenUsageInRange(since, tenantId, {
        columns: USAGE_SELECT_FULL,
        globalLimit: 80_000,
      });
      const usage = raw as AgentTokenUsageRow[];

      if (usage.length === 0) return [] as UsageDailySummary[];

      let agentToTenant = new Map<string, string>();
      if (tenantId) {
        for (const r of usage) {
          if (r.agent_id) agentToTenant.set(r.agent_id, tenantId);
        }
      } else {
        const agentIds = [...new Set(usage.map((r) => r.agent_id).filter(Boolean))];
        agentToTenant = await fetchAgentTenantMap(agentIds);
      }

      const tz = "America/Sao_Paulo";
      const byKey = new Map<string, UsageDailySummary>();
      for (const row of usage) {
        const day = new Date(row.created_at).toLocaleDateString("en-CA", { timeZone: tz });
        const tenantIdVal = agentToTenant.get(row.agent_id) ?? "";
        const key = `${day}|${tenantIdVal}|${row.agent_id}|${row.model ?? ""}|${row.message_role ?? ""}`;
        const cur = byKey.get(key) || {
          day,
          tenant_id: tenantIdVal,
          agent_id: row.agent_id,
          model: row.model ?? "unknown",
          phase: row.message_role ?? "unknown",
          total_requests: 0,
          sum_prompt: 0,
          sum_completion: 0,
          sum_tokens: 0,
          avg_latency_ms: 0,
          p95_latency_ms: 0,
          sum_tool_calls: 0,
        };
        cur.total_requests += 1;
        cur.sum_prompt += row.prompt_tokens || 0;
        cur.sum_completion += row.completion_tokens || 0;
        cur.sum_tokens += row.total_tokens || (row.prompt_tokens || 0) + (row.completion_tokens || 0);
        cur.sum_tool_calls += extractToolCallsCount(row.metadata, row.message_role ?? "");
        byKey.set(key, cur);
      }

      return Array.from(byKey.values()).sort((a, b) => b.day.localeCompare(a.day));
    },
    refetchInterval: 30000,
  });
}

export function useRecentUsageEvents(limit = 4000, tenantId?: string | null) {
  return useQuery({
    queryKey: ["usage-events-recent", limit, tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 35);

      const raw = await fetchAgentTokenUsageInRange(since, tenantId, {
        columns: USAGE_SELECT_FULL,
        globalLimit: 80_000,
      });
      let usage = raw as AgentTokenUsageRow[];

      if (usage.length === 0) return [] as UsageEvent[];

      let agentToTenant = new Map<string, string>();
      if (tenantId) {
        for (const r of usage) {
          if (r.agent_id) agentToTenant.set(r.agent_id, tenantId);
        }
      } else {
        const agentIds = [...new Set(usage.map((r) => r.agent_id).filter(Boolean))];
        agentToTenant = await fetchAgentTenantMap(agentIds);
      }

      usage.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      usage = usage.slice(0, limit);

      const events: UsageEvent[] = usage.map((row) => ({
        id: row.id,
        tenant_id: agentToTenant.get(row.agent_id) ?? "",
        agent_id: row.agent_id,
        conversation_id: row.conversation_id,
        provider: row.provider ?? "",
        model: row.model ?? "",
        prompt_tokens: row.prompt_tokens ?? 0,
        completion_tokens: row.completion_tokens ?? 0,
        total_tokens: row.total_tokens ?? (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0),
        latency_ms: null,
        tool_calls_count: extractToolCallsCount(row.metadata, row.message_role ?? ""),
        phase: row.message_role ?? "unknown",
        created_at: row.created_at,
      }));

      return events;
    },
    refetchInterval: 10000,
  });
}
