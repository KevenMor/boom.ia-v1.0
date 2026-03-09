import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export interface AgentTokenSummary {
  agent_id: string;
  agent_name: string;
  tenant_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  total_requests: number;
  tool_calls: number;
  avg_latency_ms: number;
  estimated_cost_usd: number;
  models_used: string[];
}

// Cost per 1M tokens (USD) — updated March 2026
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gemini-2.0-flash": { input: 0.075, output: 0.30 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.60 },
  "gemini-2.5-pro": { input: 1.25, output: 5.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-5": { input: 5.00, output: 15.00 },
  "gpt-5-mini": { input: 0.30, output: 1.25 },
};

function getModelCost(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const [key, cost] of Object.entries(MODEL_COSTS)) {
    if (lower.includes(key)) return cost;
  }
  // Default fallback
  if (lower.includes("gemini")) return { input: 0.15, output: 0.60 };
  if (lower.includes("gpt")) return { input: 0.15, output: 0.60 };
  return { input: 0.10, output: 0.40 };
}

export function estimateCostUsd(promptTokens: number, completionTokens: number, model: string): number {
  const cost = getModelCost(model);
  return (promptTokens / 1_000_000) * cost.input + (completionTokens / 1_000_000) * cost.output;
}

export function useTokensByAgent(days = 7, tenantId?: string | null) {
  return useQuery({
    queryKey: ["tokens-by-agent", days, tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      let query = nexusDb
        .from("agent_token_usage")
        .select("agent_id, provider, model, prompt_tokens, completion_tokens, total_tokens, metadata, message_role")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(10000);

      const { data: rows, error } = await query;
      if (error) throw error;

      let usage = (rows ?? []) as Array<{
        agent_id: string;
        provider: string;
        model: string;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        metadata: Record<string, unknown> | null;
        message_role: string;
      }>;

      if (tenantId && usage.length > 0) {
        const agentIds = [...new Set(usage.map((r) => r.agent_id).filter(Boolean))];
        const { data: agents } = await nexusDb
          .from("agents")
          .select("id, tenant_id")
          .in("id", agentIds);
        const tenantAgentIds = new Set(
          (agents ?? []).filter((a: { tenant_id: string }) => a.tenant_id === tenantId).map((a: { id: string }) => a.id)
        );
        if (tenantAgentIds.size > 0) {
          usage = usage.filter((r) => tenantAgentIds.has(r.agent_id));
        }
      }

      const events = usage.map((r) => ({
        agent_id: r.agent_id,
        provider: r.provider,
        model: r.model,
        prompt_tokens: r.prompt_tokens ?? 0,
        completion_tokens: r.completion_tokens ?? 0,
        total_tokens: r.total_tokens ?? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
        latency_ms: null as number | null,
        tool_calls_count: r.message_role === "dual_provider" && r.metadata?.dispatcher ? 1 : 0,
        phase: r.message_role,
      }));

      // Load agents for name mapping
      const { data: agents } = await nexusDb
        .from("agents")
        .select("id, name, tenants(name)");

      const agentMap = new Map<string, { name: string; tenant: string }>();
      for (const a of agents ?? []) {
        agentMap.set(a.id, {
          name: a.name || "Sem nome",
          tenant: (a.tenants as any)?.name || "—",
        });
      }

      // Aggregate by agent
      const byAgent = new Map<string, {
        prompt: number; completion: number; total: number;
        requests: number; toolCalls: number; latencySum: number; latencyCount: number;
        costUsd: number; models: Set<string>;
      }>();

      for (const e of events ?? []) {
        const key = e.agent_id || "unknown";
        const existing = byAgent.get(key) || {
          prompt: 0, completion: 0, total: 0,
          requests: 0, toolCalls: 0, latencySum: 0, latencyCount: 0,
          costUsd: 0, models: new Set<string>(),
        };
        const pt = e.prompt_tokens || 0;
        const ct = e.completion_tokens || 0;
        existing.prompt += pt;
        existing.completion += ct;
        existing.total += e.total_tokens || (pt + ct);
        existing.requests += 1;
        existing.toolCalls += e.tool_calls_count || 0;
        if (e.latency_ms) {
          existing.latencySum += e.latency_ms;
          existing.latencyCount += 1;
        }
        existing.costUsd += estimateCostUsd(pt, ct, e.model || "");
        if (e.model) existing.models.add(e.model);
        byAgent.set(key, existing);
      }

      const result: AgentTokenSummary[] = Array.from(byAgent.entries()).map(([agentId, stats]) => {
        const info = agentMap.get(agentId);
        return {
          agent_id: agentId,
          agent_name: info?.name || agentId.slice(0, 8),
          tenant_name: info?.tenant || "—",
          prompt_tokens: stats.prompt,
          completion_tokens: stats.completion,
          total_tokens: stats.total,
          total_requests: stats.requests,
          tool_calls: stats.toolCalls,
          avg_latency_ms: stats.latencyCount > 0 ? Math.round(stats.latencySum / stats.latencyCount) : 0,
          estimated_cost_usd: stats.costUsd,
          models_used: Array.from(stats.models),
        };
      });

      return result.sort((a, b) => b.total_tokens - a.total_tokens);
    },
    refetchInterval: 30000,
  });
}
