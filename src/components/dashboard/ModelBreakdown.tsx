import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Cpu } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";
import { type DashboardVisual, CW_DONUT_COLORS, chartTooltipStyle } from "@/lib/dashboard-visual";
import { Ms } from "@/components/ui/material-symbol";
import { cn } from "@/lib/utils";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
  visual?: DashboardVisual;
  /** Layout Stitch (cartão vidro + legenda maior + paleta violeta/teal nos primeiros segmentos). */
  premiumStitch?: boolean;
}

const DONUT_COLORS = ["hsl(296, 68%, 61%)", "hsl(236, 92%, 66%)", "hsl(340, 100%, 68%)", "hsl(16, 100%, 72%)", "hsl(268, 90%, 66%)", "hsl(199, 89%, 48%)"];

const STITCH_DONUT = ["#7C3AED", "#0d9488", "#a855f7", "#cbd5e1", "#94a3b8", "#c4b5fd"];

function shortModelCenterLabel(model: string): string {
  const raw = model.replace(/^[\s/]+|[\s/]+$/g, "");
  const head = raw.split(/[/:]/)[0]?.trim() || raw;
  if (head.length <= 14) return head;
  return `${head.slice(0, 12)}…`;
}

export function ModelBreakdown({ data, loading, visual = "default", premiumStitch }: Props) {
  const stitch = premiumStitch && visual === "default";
  const donutPalette = visual === "cw" ? [...CW_DONUT_COLORS] : stitch ? STITCH_DONUT : DONUT_COLORS;

  const byModel = new Map<string, { tokens: number; requests: number }>();
  for (const row of data) {
    const model = row.model || "unknown";
    const existing = byModel.get(model) || { tokens: 0, requests: 0 };
    existing.tokens += row.sum_tokens || 0;
    existing.requests += row.total_requests || 0;
    byModel.set(model, existing);
  }

  const models = Array.from(byModel.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.tokens - a.tokens);

  const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0) || 1;

  const pieData = models.slice(0, 6).map((m) => ({
    name: m.model,
    value: m.tokens,
  }));

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  const tipStyle =
    stitch
      ? ({
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          fontSize: "13px",
          color: "#0f172a",
        } as CSSProperties)
      : chartTooltipStyle(visual);

  const body = loading ? (
    <Skeleton className={stitch ? "h-[320px] w-full rounded-xl" : "h-[260px] w-full rounded-xl"} />
  ) : models.length === 0 ? (
    <div
      className={
        stitch ? "py-10 text-center text-base text-[#64748b]" : visual === "cw" ? "py-10 text-center text-sm text-cw-slate-10" : "py-10 text-center text-sm text-muted-foreground"
      }
    >
      Sem dados
    </div>
  ) : stitch ? (
    <div className="flex flex-col items-center gap-8 pb-4">
      <div className="relative flex h-[200px] w-[200px] shrink-0 items-center justify-center">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={84}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={donutPalette[idx % donutPalette.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tipStyle} formatter={(value: number) => [fmt(value), "tokens"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none relative z-10 flex max-w-[9rem] flex-col items-center justify-center px-2 text-center">
          <span className="text-[1.4rem] font-bold leading-none tracking-tight text-[#0f172a] dark:text-foreground">
            {shortModelCenterLabel(models[0]?.model ?? "—")}
          </span>
          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b] dark:text-muted-foreground">
            Principal
          </span>
        </div>
      </div>
      <div className="grid w-full grid-cols-1 gap-2.5">
        {models.slice(0, 6).map((m, idx) => {
          const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
          const emphasized = idx === 0;
          return (
            <div
              key={m.model}
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3.5 transition-colors",
                emphasized
                  ? "border-slate-100 bg-slate-50 hover:border-[#7c3aed]/25 dark:border-border dark:bg-muted/40"
                  : "border-transparent hover:border-slate-100 hover:bg-slate-50 dark:hover:bg-muted/30",
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-[3px] ring-[#7c3aed]/10"
                  style={{ backgroundColor: donutPalette[idx % donutPalette.length] }}
                />
                <span
                  className={cn(
                    "min-w-0 break-words leading-snug",
                    emphasized
                      ? "text-base font-bold text-[#0f172a] dark:text-foreground"
                      : "text-[0.9375rem] font-semibold text-[#475569] dark:text-muted-foreground",
                  )}
                  title={m.model}
                >
                  {m.model}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 tabular-nums tracking-tight",
                  emphasized ? "text-lg font-bold text-[#0f172a] dark:text-foreground" : "text-base font-semibold text-[#64748b] dark:text-muted-foreground",
                )}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-4">
      <div className="h-[180px] w-[180px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
              {pieData.map((_, idx) => (
                <Cell key={idx} fill={donutPalette[idx % donutPalette.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={chartTooltipStyle(visual)} formatter={(value: number) => [fmt(value), "tokens"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full space-y-2">
        {models.slice(0, 6).map((m, idx) => {
          const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
          return (
            <div key={m.model} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: donutPalette[idx % donutPalette.length] }} />
              <span className="flex-1 truncate text-xs" title={m.model}>
                {m.model}
              </span>
              <span className={visual === "cw" ? "metric-value shrink-0 text-xs text-cw-slate-10" : "metric-value shrink-0 text-xs text-muted-foreground"}>
                {fmt(m.tokens)}
              </span>
              <span className={visual === "cw" ? "metric-value shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400" : "metric-value shrink-0 text-xs font-medium text-success"}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (stitch) {
    return (
      <div className="glass-card flex min-h-[300px] flex-col rounded-xl border border-slate-200/60 bg-white p-6 shadow-soft transition-colors hover:border-[#7c3aed]/25 hover:shadow-md dark:border-border dark:bg-card/40">
        <h3 className="mb-5 flex shrink-0 items-center justify-between gap-3 text-xl font-semibold leading-snug tracking-tight text-[#0f172a] dark:text-foreground">
          <span>Uso por modelo</span>
          <Ms name="info" className="!text-[22px] shrink-0 text-[#64748b]/45" aria-hidden />
        </h3>
        {body}
      </div>
    );
  }

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"
            }
          >
            <Cpu className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary"} />
          </span>
          <span className="box-title">Uso por Modelo</span>
        </div>
      </div>
      <div className="box-body">{body}</div>
    </div>
  );
}