import type { UsageDailySummary, UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";
import { Ms } from "@/components/ui/material-symbol";

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function SparkTeal({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" preserveAspectRatio="none" viewBox="0 0 100 40">
      <path d="M0 35 Q 20 30, 40 25 T 80 10 T 100 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

function SparkRose({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" preserveAspectRatio="none" viewBox="0 0 100 40">
      <path d="M0 38 Q 25 35, 50 30 T 75 25 T 100 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

interface Props {
  dailySummary: UsageDailySummary[];
  events: UsageEvent[];
  /** Preferência: custo estimado no período (soma por agente — alinhado ao tenant ou “todos”). */
  estimatedCostUsdPeriod?: number;
  activeAgents: number;
  totalAgents: number;
  loading?: boolean;
}

function aggregateTokensByDay(rows: UsageDailySummary[]): { days: string[]; totals: number[] } {
  const map = new Map<string, number>();
  for (const d of rows) {
    const key = (d.day || "").slice(0, 10);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + (d.sum_tokens || 0));
  }
  const days = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  return { days, totals: days.map((day) => map.get(day) ?? 0) };
}

export function PremiumKpiStrip({
  dailySummary,
  events,
  estimatedCostUsdPeriod,
  activeAgents,
  totalAgents,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="grid w-full grid-cols-1 gap-6 font-jakarta tracking-normal md:grid-cols-3">
        {[1, 2, 3].map((k) => (
          <div key={k} className="glass-card flex min-h-[160px] flex-col rounded-2xl border border-slate-200/60 bg-white p-6 shadow-soft dark:border-border/60 dark:bg-card/40">
            <div className="mb-4 h-10 w-10 animate-pulse rounded-xl bg-slate-100 dark:bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-muted" />
            <div className="mt-2 h-8 w-32 animate-pulse rounded-md bg-slate-100 dark:bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  const { totals: totalsPerDay } = aggregateTokensByDay(dailySummary);

  const n = totalsPerDay.length;
  const mid = Math.max(1, Math.floor(n / 2));
  const recentTokens = totalsPerDay.slice(Math.max(0, n - mid)).reduce((s, x) => s + x, 0);
  const priorTokens = totalsPerDay.slice(Math.max(0, n - 2 * mid), Math.max(0, n - mid)).reduce((s, x) => s + x, 0);

  const trendPct: number | null =
    priorTokens > 0 ? Math.round(((recentTokens - priorTokens) / priorTokens) * 100) : recentTokens > 0 ? 100 : null;

  const totalPeriodTokens = totalsPerDay.reduce((s, x) => s + x, 0);

  const tz = "America/Sao_Paulo";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayStr = yesterdayDate.toLocaleDateString("en-CA", { timeZone: tz });
  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { timeZone: tz });
  };

  const costUsdFallback = events.reduce(
    (s, e) => s + estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || ""),
    0,
  );
  const costUsdApprox = estimatedCostUsdPeriod ?? costUsdFallback;

  let todayCostUsd = 0;
  let yesterdayCostUsd = 0;
  for (const e of events) {
    const d = getLocalDate(e.created_at);
    const c = estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
    if (d === today) todayCostUsd += c;
    if (d === yesterdayStr) yesterdayCostUsd += c;
  }
  const costDeltaPct =
    yesterdayCostUsd > 1e-9 ? Math.round(((todayCostUsd - yesterdayCostUsd) / yesterdayCostUsd) * 100) : null;

  const utilizationPct = totalAgents > 0 ? Math.min(100, Math.round((activeAgents / totalAgents) * 100)) : 0;

  return (
    <div className="grid w-full grid-cols-1 gap-6 font-jakarta tracking-normal md:grid-cols-3">
      <div className="glass-card group flex flex-col rounded-2xl border border-slate-200/60 bg-white p-6 shadow-soft transition-all duration-300 hover:border-[#7c3aed]/30 hover:shadow-glow dark:border-border/60 dark:bg-card/50">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-xl bg-[#7c3aed]/5 p-2.5 text-[#7c3aed] transition-all duration-300 group-hover:bg-[#7c3aed] group-hover:text-white">
            <Ms name="toll" className="!text-[24px]" />
          </div>
          {trendPct !== null ? (
            <div
              className={
                trendPct >= 0
                  ? "flex items-center gap-1 rounded-full border border-[#0d9488]/20 bg-[#0d9488]/10 px-2 py-0.5 text-[12px] font-bold text-[#0d9488]"
                  : "flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[12px] font-bold text-[#ef4444]"
              }
            >
              <Ms name={trendPct >= 0 ? "trending_up" : "trending_down"} className="!text-[14px] font-bold" />
              <span>{`${trendPct >= 0 ? "+" : ""}${trendPct}%`}</span>
            </div>
          ) : (
            <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[#64748b] dark:bg-muted">
              —
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748b] dark:text-muted-foreground">
          Total tokens
        </span>
        <div className="mt-1 flex items-end gap-2">
          <div className="text-[32px] font-bold tabular-nums tracking-[-0.03em] text-[#0f172a] dark:text-foreground">{fmtTok(totalPeriodTokens)}</div>
          <div className="mb-1 h-10 flex-1 opacity-40">
            <SparkTeal className="h-full w-full text-[#0d9488]" />
          </div>
        </div>
      </div>

      <div className="glass-card group flex flex-col rounded-2xl border border-slate-200/60 bg-white p-6 shadow-soft transition-all duration-300 hover:border-[#7c3aed]/30 hover:shadow-glow dark:border-border/60 dark:bg-card/50">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-xl bg-[#7c3aed]/5 p-2.5 text-[#7c3aed] transition-all duration-300 group-hover:bg-[#7c3aed] group-hover:text-white">
            <Ms name="payments" className="!text-[24px]" />
          </div>
          <div
            className={
              costDeltaPct !== null && costDeltaPct > 0
                ? "flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[12px] font-bold text-[#ef4444]"
                : costDeltaPct !== null && costDeltaPct < 0
                  ? "flex items-center gap-1 rounded-full border border-[#0d9488]/20 bg-[#0d9488]/10 px-2 py-0.5 text-[12px] font-bold text-[#0d9488]"
                  : "flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[12px] font-bold text-[#64748b] dark:border-border dark:bg-muted"
            }
          >
            {costDeltaPct !== null && (
              <Ms
                name={costDeltaPct > 0 ? "trending_up" : costDeltaPct < 0 ? "trending_down" : "horizontal_rule"}
                className="!text-[14px] font-bold"
              />
            )}
            <span>{costDeltaPct === null ? "—" : `${costDeltaPct > 0 ? "+" : ""}${costDeltaPct}%`}</span>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748b] dark:text-muted-foreground">
          Custo total
        </span>
        <div className="mt-1 flex items-end gap-2">
          <div className="text-[32px] font-bold tabular-nums tracking-[-0.03em] text-[#0f172a] dark:text-foreground">
            {costUsdApprox < 0.01 ? "US$ 0" : `US$ ${costUsdApprox >= 100 ? costUsdApprox.toFixed(0) : costUsdApprox.toFixed(2)}`}
          </div>
          <div className="mb-1 h-10 flex-1 opacity-40">
            <SparkRose className="h-full w-full text-[#ef4444]" />
          </div>
        </div>
      </div>

      <div className="glass-card group flex flex-col rounded-2xl border border-slate-200/60 bg-white p-6 shadow-soft transition-all duration-300 hover:border-[#7c3aed]/30 hover:shadow-glow dark:border-border/60 dark:bg-card/50">
        <div className="mb-4 flex items-start justify-between">
          <div className="rounded-xl bg-[#7c3aed]/5 p-2.5 text-[#7c3aed] transition-all duration-300 group-hover:bg-[#7c3aed] group-hover:text-white">
            <Ms name="smart_toy" className="!text-[24px]" />
          </div>
          <div className="rounded-full border border-[#7c3aed]/20 bg-[#7c3aed]/10 px-2 py-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#7c3aed]">
              {utilizationPct}% ativo
            </span>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#64748b] dark:text-muted-foreground">
          Agentes ativos
        </span>
        <div className="mt-1 text-[32px] font-bold tabular-nums tracking-[-0.03em] text-[#0f172a] dark:text-foreground">{activeAgents}</div>
        <div className="mt-auto pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#64748b] dark:text-muted-foreground">Capacidade</span>
            <span className="text-[11px] font-bold text-[#7c3aed]">{utilizationPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
            <div className="h-full rounded-full bg-[#7c3aed] shadow-[0_0_8px_rgba(124,58,237,0.4)]" style={{ width: `${utilizationPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
