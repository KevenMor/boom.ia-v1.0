import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import type { AgentTokenSummary } from "@/hooks/useTokensByAgent";

interface Props {
  data: AgentTokenSummary[];
  loading?: boolean;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  const brl = usd * 5.2;
  if (brl < 0.01) return "< R$ 0,01";
  return `R$ ${brl.toFixed(2).replace(".", ",")}`;
}

const AGENT_COLORS = [
  "bg-primary",
  "bg-primary-tint1",
  "bg-primary-tint2",
  "bg-primary-tint3",
  "bg-secondary",
  "bg-info",
];

export function AgentTokenBreakdown({ data, loading }: Props) {
  const totalCost = data.reduce((s, a) => s + a.estimated_cost_usd, 0);

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </span>
          <div>
            <span className="box-title">Tokens por Agente</span>
            <p className="text-[11px] text-muted-foreground">entrada vs saída — últimos 7 dias</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Custo total</p>
          <p className="metric-value text-base font-bold gradient-text">{fmtCost(totalCost)}</p>
        </div>
      </div>

      <div className="box-body">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados de uso</div>
        ) : (
          <div className="space-y-3">
            {data.map((agent, idx) => {
              const totalTk = agent.prompt_tokens + agent.completion_tokens || 1;
              const inputPct = ((agent.prompt_tokens / totalTk) * 100).toFixed(0);
              const outputPct = ((agent.completion_tokens / totalTk) * 100).toFixed(0);
              const colorClass = AGENT_COLORS[idx % AGENT_COLORS.length];

              return (
                <div key={agent.agent_id} className="rounded-lg border border-border p-3.5 transition-all hover:border-primary/20 hover:shadow-sm">
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colorClass} text-white text-xs font-bold`}>
                      {agent.agent_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{agent.agent_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{agent.tenant_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="metric-value text-sm font-bold">{fmt(agent.total_tokens)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtCost(agent.estimated_cost_usd)}</p>
                    </div>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full rounded-l-full bg-primary transition-all duration-700"
                      style={{ width: `${inputPct}%` }}
                    />
                    <div
                      className="h-full rounded-r-full bg-success transition-all duration-700"
                      style={{ width: `${outputPct}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <ArrowUpRight className="h-2.5 w-2.5 text-primary" />
                      {fmt(agent.prompt_tokens)} ({inputPct}%)
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ArrowDownRight className="h-2.5 w-2.5 text-success" />
                      {fmt(agent.completion_tokens)} ({outputPct}%)
                    </span>
                    <span className="ml-auto font-mono">{agent.total_requests} req</span>
                    {agent.tool_calls > 0 && <span className="font-mono">{agent.tool_calls} tools</span>}
                  </div>

                  {agent.models_used.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {agent.models_used.map((m) => (
                        <span key={m} className="text-[9px] bg-muted border border-border px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
