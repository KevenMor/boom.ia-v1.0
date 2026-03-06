import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Flame } from "lucide-react";
import type { UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";
import { useRef, useCallback } from "react";

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
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    cardRef.current!.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    cardRef.current!.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

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

  const projectedMonthly = todayCostUsd * 30;

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} className="dash-card">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <DollarSign className="h-4 w-4 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Custo Estimado</h2>
          <p className="text-[11px] text-muted-foreground">preços oficiais por modelo</p>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        <div className="space-y-4">
          {/* Today — hero number */}
          <div className="relative rounded-xl bg-gradient-to-br from-emerald-500/10 via-transparent to-primary/5 border border-emerald-500/20 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="h-3 w-3 text-emerald-500" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Hoje</p>
            </div>
            <p className="metric-value text-2xl font-bold text-foreground">{fmtBrl(todayCostUsd)}</p>
            <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground font-mono">
              <span>↑ {(todayPrompt / 1000).toFixed(1)}k in</span>
              <span>↓ {(todayCompletion / 1000).toFixed(1)}k out</span>
            </div>
          </div>

          {/* Projected */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Projeção mensal</p>
            </div>
            <p className="metric-value text-lg font-bold">{fmtBrl(projectedMonthly)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">baseado no consumo de hoje</p>
          </div>

          {/* Period total */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Total no período</span>
            <span className="metric-value text-sm font-bold">{fmtBrl(totalCostUsd)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
