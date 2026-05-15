import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp } from "lucide-react";
import type { UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";

interface Props {
  events: UsageEvent[];
  loading?: boolean;
  visual?: string;
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
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayStr = yesterdayDate.toLocaleDateString("en-CA", { timeZone: tz });
  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { timeZone: tz });
  };

  const todayEvents = events.filter((e) => getLocalDate(e.created_at) === today);
  const yesterdayEvents = events.filter((e) => getLocalDate(e.created_at) === yesterdayStr);

  let todayCostUsd = 0;
  let yesterdayCostUsd = 0;
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

  for (const e of yesterdayEvents) {
    yesterdayCostUsd += estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
  }

  for (const e of events) {
    totalCostUsd += estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
  }

  const projectedMonthly = todayCostUsd * 30;
  const costDeltaPct =
    yesterdayCostUsd > 1e-9 ? (((todayCostUsd - yesterdayCostUsd) / yesterdayCostUsd) * 100).toFixed(0) : null;

  if (loading) {
    return (
      <div className="flex h-full min-h-[200px] flex-col rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-md font-medium text-foreground">Custo estimado</h3>
        <Link to="/analytics/tokens" className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150">
          Ver detalhes →
        </Link>
      </div>

      <div className="space-y-4">
        <div>
          <span className="text-xs text-muted-foreground">Hoje</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {fmtBrl(todayCostUsd)}
            </span>
            {costDeltaPct && (
              <span className={`text-xs ${Number(costDeltaPct) <= 0 ? "text-success" : "text-destructive"}`}>
                {Number(costDeltaPct) >= 0 ? "+" : ""}{costDeltaPct}%
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {(todayPrompt / 1000).toFixed(1)}k in · {(todayCompletion / 1000).toFixed(1)}k out
          </p>
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground">Projeção mensal</span>
          </div>
          <span className="text-sm font-medium text-foreground">{fmtBrl(projectedMonthly)}</span>
        </div>

        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Total período</span>
          <span className="text-sm font-medium text-foreground">{fmtBrl(totalCostUsd)}</span>
        </div>
      </div>
    </div>
  );
}
