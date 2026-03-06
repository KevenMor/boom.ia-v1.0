import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp } from "lucide-react";
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
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  // Project monthly cost based on today's average
  const projectedMonthly = todayCostUsd * 30;

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">Custo Estimado</h2>
          <p className="text-xs text-muted-foreground">baseado em precos oficiais por modelo</p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <div className="space-y-4">
          {/* Today */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Hoje</p>
            <p className="text-lg font-bold">{fmtBrl(todayCostUsd)}</p>
            <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
              <span>Entrada: {(todayPrompt / 1000).toFixed(1)}k tokens</span>
              <span>Saida: {(todayCompletion / 1000).toFixed(1)}k tokens</span>
            </div>
          </div>

          {/* Projected */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projecao mensal</p>
            </div>
            <p className="text-lg font-bold">{fmtBrl(projectedMonthly)}</p>
            <p className="text-[10px] text-muted-foreground">baseado no consumo de hoje</p>
          </div>

          {/* Period total */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Total no periodo</span>
            <span className="text-xs font-bold">{fmtBrl(totalCostUsd)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
