import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Flame } from "lucide-react";
import type { UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";

interface Props {
  events: UsageEvent[];
  loading?: boolean;
}

function fmtBrl(usd: number): string {
  const brl = usd * 5.2;
  if (brl < 0.01) return "R$ 0,00";
  return `R$ ${brl.toFixed(2).replace(".", ",")}`;
}

export function CostEstimationCard({ events, loading }: Props) {
  const tz = "America/Sao_Paulo";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { timeZone: tz });
  };

  const todayEvents = events.filter((e) => getLocalDate(e.created_at) === today);

  let todayCostUsd = 0;
  let todayPrompt = 0;
  let todayCompletion = 0;
  let totalCostUsd = 0;

  for (const e of todayEvents) {
    const pt = e.prompt_tokens || 0;
    const ct = e.completion_tokens || 0;
    todayPrompt += pt;
    todayCompletion += ct;
    todayCostUsd += estimateCostUsd(pt, ct, e.model || "");
  }

  for (const e of events) {
    totalCostUsd += estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
  }

  const projectedMonthly = todayCostUsd * 30;

  return (
    <div className="box h-full">
      <div className="box-header justify-between pb-0 border-0">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
            <DollarSign className="h-4 w-4 text-success" />
          </span>
          <span className="box-title">Custo Estimado</span>
        </div>
      </div>

      <div className="box-body">
        {loading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <div className="space-y-4">
            {/* Today — summary banner */}
            <div
              className="rounded-lg p-4 flex items-center gap-4"
              style={{ background: "linear-gradient(135deg, hsl(var(--success) / 0.08), hsl(var(--primary) / 0.05))" }}
            >
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground mb-1 font-medium">
                  Custo de Hoje
                </p>
                <p className="metric-value text-2xl font-bold text-foreground">{fmtBrl(todayCostUsd)}</p>
                <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground font-mono">
                  <span>↑ {(todayPrompt / 1000).toFixed(1)}k in</span>
                  <span>↓ {(todayCompletion / 1000).toFixed(1)}k out</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <Flame className="h-6 w-6 text-success" />
              </div>
            </div>

            {/* Projected */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium">Projeção mensal</p>
              </div>
              <p className="metric-value text-lg font-bold">{fmtBrl(projectedMonthly)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">baseado no consumo de hoje</p>
            </div>

            {/* Period total */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Total no período</span>
              <span className="metric-value text-sm font-bold">{fmtBrl(totalCostUsd)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
