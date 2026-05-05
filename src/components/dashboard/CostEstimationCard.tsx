import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DollarSign, TrendingUp, Flame } from "lucide-react";
import type { UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";
import { type DashboardVisual, iconBadgeBox, iconBadgeIcon } from "@/lib/dashboard-visual";
import { cn } from "@/lib/utils";
import { Ms } from "@/components/ui/material-symbol";

interface Props {
  events: UsageEvent[];
  loading?: boolean;
  visual?: DashboardVisual | "premium";
}

function fmtBrl(usd: number): string {
  const brl = usd * 5.2;
  if (brl < 0.01) return "R$ 0,00";
  return `R$ ${brl.toFixed(2).replace(".", ",")}`;
}

function costDeltaBadgeClass(kind: "positive" | "negative" | "neutral"): string {
  return cn(
    "inline-flex shrink-0 items-center gap-0.5 rounded-[6px] px-[7px] py-0.5 text-[10px] font-medium sm:text-[11px]",
    kind === "positive" &&
      "bg-teal-500/15 text-teal-800 dark:bg-[rgba(18,165,148,0.15)] dark:text-teal-300",
    kind === "negative" &&
      "bg-[rgba(229,70,102,0.15)] text-red-800 dark:bg-[rgba(229,70,102,0.15)] dark:text-red-300",
    kind === "neutral" && "bg-cw-solid-2 text-cw-slate-10",
  );
}

export function CostEstimationCard({ events, loading, visual = "default" }: Props) {
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
  const costDeltaKind: "positive" | "negative" | "neutral" =
    costDeltaPct === null ? "neutral" : Number(costDeltaPct) <= 0 ? "positive" : "negative";
  const costDeltaLabel =
    costDeltaPct === null ? null : `${Number(costDeltaPct) >= 0 ? "+" : ""}${costDeltaPct}% vs ontem`;

  const budgetUsd = Math.max(projectedMonthly * 1.06, projectedMonthly > 0 ? projectedMonthly + 50 : todayCostUsd * 90 + 1, 1);
  const budgetBarPct =
    projectedMonthly > 0 && budgetUsd > 0 ? Math.min(100, (projectedMonthly / budgetUsd) * 100) : 0;

  if (visual === "premium") {
    return (
      <div className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#8b5cf6] p-6 text-white shadow-lg shadow-[#7c3aed]/20 transition-transform duration-300 hover:-translate-y-0.5">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-2 flex items-center gap-2 opacity-90">
            <Ms name="account_balance_wallet" className="!text-[20px]" />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]">Custo estimado (mês)</h3>
          </div>
          {loading ? (
            <Skeleton className="h-24 w-full rounded-xl bg-white/20" />
          ) : (
            <>
              <div className="mb-1 text-[2.125rem] font-bold leading-none tracking-[-0.03em]">{fmtBrl(projectedMonthly)}</div>
              <p className="pb-4 text-[14px] font-medium leading-relaxed text-white/90 opacity-95">
                Projeção baseada no uso atual
              </p>
              <div className="mt-auto rounded-xl border border-white/20 bg-white/10 p-4 shadow-inner backdrop-blur-md">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-90">Limite de alerta</span>
                  <span className="text-sm font-bold">{fmtBrl(budgetUsd)}</span>
                </div>
                <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="relative h-full rounded-full bg-[#2dd4bf] shadow-[0_0_10px_rgba(45,212,191,0.5)] transition-all duration-1000 ease-out"
                    style={{ width: `${budgetBarPct}%` }}
                  >
                    <div className="absolute inset-0 w-full animate-pulse rounded-full bg-white/25" />
                  </div>
                </div>
                {budgetBarPct >= 82 ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-teal-50">
                    <Ms name="warning" className="!text-[14px]" />
                    Próximo ao limite estabelecido
                  </div>
                ) : (
                  <div className="text-[11px] font-medium text-violet-100/90">Margem confortável no orçamento de referência.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (visual === "cw") {
    return (
      <div className="box flex h-full flex-col">
        <div className="box-header !border-0 pb-3 pt-5">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-cw-slate-10">Custo estimado</span>
            <span className="inline-flex h-6 items-center rounded-[7px] bg-teal-500/15 px-2 text-[11px] font-medium text-teal-800 outline outline-1 outline-offset-[-1px] outline-teal-500/30 dark:text-teal-300">
              Hoje
            </span>
          </div>
        </div>

        <div className="box-body flex flex-1 flex-col !pt-0">
          {loading ? (
            <Skeleton className="h-40 w-full rounded-[14px]" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-teal-500/15">
                  <DollarSign className="h-[18px] w-[18px] text-teal-700 dark:text-teal-300" strokeWidth={2} />
                </div>
                <p className="metric-value text-[1.75rem] font-bold leading-none tracking-[-0.04em] text-cw-slate-12">
                  {fmtBrl(todayCostUsd)}
                </p>
                {costDeltaLabel ? (
                  <span className={costDeltaBadgeClass(costDeltaKind)}>{costDeltaLabel}</span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-cw-slate-10">
                {(todayPrompt / 1000).toFixed(1)}k tokens in · {(todayCompletion / 1000).toFixed(1)}k out
              </p>
              <div className="my-3 h-px bg-cw-weak" />
              <div className="flex items-center justify-between border-b border-cw-weak py-2.5 text-[13px] first:pt-0">
                <span className="text-cw-slate-10">Projeção mensal</span>
                <span className="font-medium tabular-nums text-cw-slate-12">{fmtBrl(projectedMonthly)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-[13px]">
                <span className="text-[11px] font-medium uppercase tracking-wider text-cw-slate-10">
                  Total no período
                </span>
                <span className="font-semibold tabular-nums text-cw-brand">{fmtBrl(totalCostUsd)}</span>
              </div>
              <p className="mb-1 text-[11px] text-cw-slate-10">Baseado no consumo registrado nos eventos do período.</p>
              <Button
                variant="ghost"
                className="mt-auto h-9 w-full rounded-lg border border-transparent bg-teal-500/10 text-sm font-medium text-teal-900 hover:bg-teal-500/18 dark:text-teal-200"
                asChild
              >
                <Link to="/analytics/tokens">Ver relatório completo</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="box h-full">
      <div className="box-header justify-between border-0 pb-0">
        <div className="flex items-center gap-2.5">
          <span className={iconBadgeBox(visual, "success")}>
            <DollarSign className={iconBadgeIcon(visual, "success")} />
          </span>
          <span className="box-title">Custo Estimado</span>
        </div>
      </div>

      <div className="box-body">
        {loading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <div className="space-y-4">
            <div
              className="flex items-center gap-4 rounded-lg p-4"
              style={{
                background: "linear-gradient(135deg, hsl(var(--success) / 0.08), hsl(var(--primary) / 0.05))",
              }}
            >
              <div className="flex-1">
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">Custo de Hoje</p>
                <p className="metric-value text-2xl font-bold text-foreground">{fmtBrl(todayCostUsd)}</p>
                <div className="mt-2 flex gap-3 font-mono text-[11px] text-muted-foreground">
                  <span>↑ {(todayPrompt / 1000).toFixed(1)}k in</span>
                  <span>↓ {(todayCompletion / 1000).toFixed(1)}k out</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <Flame className="h-6 w-6 text-success" />
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="mb-1 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[11px] font-medium text-muted-foreground">Projeção mensal</p>
              </div>
              <p className="metric-value text-lg font-bold">{fmtBrl(projectedMonthly)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">baseado no consumo de hoje</p>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total no período</span>
              <span className="metric-value text-sm font-bold">{fmtBrl(totalCostUsd)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
