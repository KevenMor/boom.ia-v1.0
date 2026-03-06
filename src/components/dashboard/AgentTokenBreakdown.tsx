import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import type { AgentTokenSummary } from "@/hooks/useTokensByAgent";
import { useRef, useCallback } from "react";

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
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-700",
];

export function AgentTokenBreakdown({ data, loading }: Props) {
  const totalCost = data.reduce((s, a) => s + a.estimated_cost_usd, 0);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    cardRef.current!.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    cardRef.current!.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} className="dash-card">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Tokens por Agente</h2>
            <p className="text-[11px] text-muted-foreground">entrada vs saída — últimos 7 dias</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Custo total</p>
          <p className="metric-value text-base font-bold gradient-text">{fmtCost(totalCost)}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Sem dados de uso</div>
      ) : (
        <div className="space-y-2.5">
          {data.map((agent, idx) => {
            const totalTk = agent.prompt_tokens + agent.completion_tokens || 1;
            const inputPct = ((agent.prompt_tokens / totalTk) * 100).toFixed(0);
            const outputPct = ((agent.completion_tokens / totalTk) * 100).toFixed(0);
            const colorGradient = AGENT_COLORS[idx % AGENT_COLORS.length];

            return (
              <div key={agent.agent_id} className="group rounded-xl border border-border bg-muted/20 p-3.5 transition-all hover:border-primary/20 hover:bg-muted/40">
                <div className="flex items-center gap-3 mb-2.5">
                  {/* Agent avatar circle */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colorGradient} text-white text-xs font-bold shadow-lg`}>
                    {agent.agent_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{agent.agent_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{agent.tenant_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="metric-value text-sm font-bold">{fmt(agent.total_tokens)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtCost(agent.estimated_cost_usd)}</p>
                  </div>
                </div>

                {/* Stacked bar */}
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full rounded-l-full bg-violet-500 transition-all duration-700"
                    style={{ width: `${inputPct}%` }}
                  />
                  <div
                    className="h-full rounded-r-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${outputPct}%` }}
                  />
                </div>

                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <ArrowUpRight className="h-2.5 w-2.5 text-violet-500" />
                    {fmt(agent.prompt_tokens)} ({inputPct}%)
                  </span>
                  <span className="flex items-center gap-0.5">
                    <ArrowDownRight className="h-2.5 w-2.5 text-emerald-500" />
                    {fmt(agent.completion_tokens)} ({outputPct}%)
                  </span>
                  <span className="ml-auto font-mono">{agent.total_requests} req</span>
                  {agent.tool_calls > 0 && <span className="font-mono">{agent.tool_calls} tools</span>}
                  {agent.avg_latency_ms > 0 && (
                    <span className="font-mono">{(agent.avg_latency_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>

                {agent.models_used.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {agent.models_used.map((m) => (
                      <span key={m} className="text-[9px] bg-background/60 border border-border px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">
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
  );
}
