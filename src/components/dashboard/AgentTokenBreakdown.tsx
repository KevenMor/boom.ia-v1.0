import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
  // Convert USD to BRL (approximate rate)
  const brl = usd * 5.2;
  if (brl < 0.01) return "< R$ 0,01";
  if (brl < 1) return `R$ ${brl.toFixed(2).replace(".", ",")}`;
  return `R$ ${brl.toFixed(2).replace(".", ",")}`;
}

export function AgentTokenBreakdown({ data, loading }: Props) {
  const totalCost = data.reduce((s, a) => s + a.estimated_cost_usd, 0);

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Tokens por Agente</h2>
            <p className="text-xs text-muted-foreground">entrada vs saida — ultimos 7 dias</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Custo estimado</p>
          <p className="text-sm font-bold text-foreground">{fmtCost(totalCost)}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sem dados de uso</div>
      ) : (
        <div className="space-y-3">
          {data.map((agent) => {
            const totalTk = agent.prompt_tokens + agent.completion_tokens || 1;
            const inputPct = ((agent.prompt_tokens / totalTk) * 100).toFixed(0);
            const outputPct = ((agent.completion_tokens / totalTk) * 100).toFixed(0);

            return (
              <div key={agent.agent_id} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{agent.agent_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{agent.tenant_name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-bold">{fmt(agent.total_tokens)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtCost(agent.estimated_cost_usd)}</p>
                  </div>
                </div>

                {/* Stacked bar: input vs output */}
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${inputPct}%` }}
                    title={`Entrada: ${fmt(agent.prompt_tokens)}`}
                  />
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${outputPct}%` }}
                    title={`Saida: ${fmt(agent.completion_tokens)}`}
                  />
                </div>

                <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <ArrowUpRight className="h-2.5 w-2.5 text-violet-500" />
                    Entrada: {fmt(agent.prompt_tokens)} ({inputPct}%)
                  </span>
                  <span className="flex items-center gap-0.5">
                    <ArrowDownRight className="h-2.5 w-2.5 text-emerald-500" />
                    Saida: {fmt(agent.completion_tokens)} ({outputPct}%)
                  </span>
                  <span>{agent.total_requests} req</span>
                  <span>{agent.tool_calls} tools</span>
                  {agent.avg_latency_ms > 0 && (
                    <span>{(agent.avg_latency_ms / 1000).toFixed(1)}s avg</span>
                  )}
                </div>

                {agent.models_used.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {agent.models_used.map((m) => (
                      <span key={m} className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
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
    </Card>
  );
}
