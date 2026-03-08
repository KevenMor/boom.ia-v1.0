import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export interface AgentTokenUsageRow {
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

export interface TokenUsageByDay {
  day: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  requests: number;
}

export interface TokenUsageByAgent {
  agent_id: string;
  agent_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  requests: number;
  estimated_cost_usd: number;
}

export interface TokenUsageByModel {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  requests: number;
  estimated_cost_usd: number;
}

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-3-flash-preview": { input: 0.075, output: 0.3 },
};

function estimateCost(prompt: number, completion: number, model: string): number {
  const lower = model.toLowerCase();
  let cost = MODEL_COSTS["gpt-4o-mini"];
  for (const [key, c] of Object.entries(MODEL_COSTS)) {
    if (lower.includes(key)) {
      cost = c;
      break;
    }
  }
  return (prompt / 1_000_000) * cost.input + (completion / 1_000_000) * cost.output;
}

export function useAgentTokenUsage(days = 30, tenantId?: string | null) {
  return useQuery({
    queryKey: ["agent-token-usage", days, tenantId ?? "all"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      let query = nexusDb
        .from("agent_token_usage")
        .select("id, created_at, agent_id, conversation_id, message_role, model, provider, prompt_tokens, completion_tokens, total_tokens, metadata")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000);

      const { data: rows, error } = await query;
      if (error) throw error;

      const usage = (rows ?? []) as AgentTokenUsageRow[];

      if (tenantId && usage.length > 0) {
        const agentIds = [...new Set(usage.map((r) => r.agent_id))];
        const { data: agents } = await nexusDb
          .from("agents")
          .select("id, tenant_id")
          .in("id", agentIds);
        const tenantAgentIds = new Set(
          (agents ?? []).filter((a: { tenant_id: string }) => a.tenant_id === tenantId).map((a: { id: string }) => a.id)
        );
        if (tenantAgentIds.size > 0) {
          return usage.filter((r) => tenantAgentIds.has(r.agent_id));
        }
      }

      return usage;
    },
    refetchInterval: 60000,
  });
}

export function useTokenUsageByDay(days = 30, tenantId?: string | null) {
  const { data: usage, ...rest } = useAgentTokenUsage(days, tenantId);

  const byDay = (usage ?? []).reduce<Record<string, TokenUsageByDay>>((acc, row) => {
    const day = row.created_at.slice(0, 10);
    const cur = acc[day] || { day, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 };
    cur.prompt_tokens += row.prompt_tokens || 0;
    cur.completion_tokens += row.completion_tokens || 0;
    cur.total_tokens += row.total_tokens || 0;
    cur.requests += 1;
    acc[day] = cur;
    return acc;
  }, {});

  const sorted = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  return { data: sorted, ...rest };
}

export function useTokenUsageByAgent(days = 30, tenantId?: string | null) {
  const { data: usage, ...rest } = useAgentTokenUsage(days, tenantId);

  const agentIds = [...new Set((usage ?? []).map((r) => r.agent_id).filter(Boolean))];
  const { data: agentsData } = useQuery({
    queryKey: ["agents-names", agentIds.join(",")],
    queryFn: async () => {
      if (agentIds.length === 0) return [] as { id: string; name: string }[];
      const { data } = await nexusDb.from("agents").select("id, name").in("id", agentIds);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: agentIds.length > 0,
  });

  const agentNames = new Map((agentsData ?? []).map((a) => [a.id, a.name || a.id.slice(0, 8)]));

  const byAgent = (usage ?? []).reduce<Record<string, TokenUsageByAgent>>((acc, row) => {
    const key = row.agent_id || "unknown";
    const cur = acc[key] || {
      agent_id: key,
      agent_name: agentNames.get(key) || key.slice(0, 8),
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      requests: 0,
      estimated_cost_usd: 0,
    };
    const pt = row.prompt_tokens || 0;
    const ct = row.completion_tokens || 0;
    cur.prompt_tokens += pt;
    cur.completion_tokens += ct;
    cur.total_tokens += row.total_tokens || pt + ct;
    cur.requests += 1;
    cur.estimated_cost_usd += estimateCost(pt, ct, row.model || "");
    acc[key] = cur;
    return acc;
  }, {});

  const sorted = Object.values(byAgent).sort((a, b) => b.total_tokens - a.total_tokens);
  return { data: sorted, ...rest };
}

export function useTokenUsageByModel(days = 30, tenantId?: string | null) {
  const { data: usage, ...rest } = useAgentTokenUsage(days, tenantId);

  const byModel = (usage ?? []).reduce<Record<string, TokenUsageByModel>>((acc, row) => {
    const key = row.model || "unknown";
    const cur = acc[key] || {
      model: key,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      requests: 0,
      estimated_cost_usd: 0,
    };
    const pt = row.prompt_tokens || 0;
    const ct = row.completion_tokens || 0;
    cur.prompt_tokens += pt;
    cur.completion_tokens += ct;
    cur.total_tokens += row.total_tokens || pt + ct;
    cur.requests += 1;
    cur.estimated_cost_usd += estimateCost(pt, ct, key);
    acc[key] = cur;
    return acc;
  }, {});

  const sorted = Object.values(byModel).sort((a, b) => b.total_tokens - a.total_tokens);
  return { data: sorted, ...rest };
}
