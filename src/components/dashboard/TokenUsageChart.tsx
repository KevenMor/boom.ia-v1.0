import { useCallback, useId, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  type DashboardVisual,
  chartAxisTickClass,
  chartGridClass,
  chartTooltipStyle,
  subtitleClass,
} from "@/lib/dashboard-visual";
import { Bar, Area, Line, ComposedChart, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";
import { toast } from "sonner";
import { Ms } from "@/components/ui/material-symbol";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
  visual?: DashboardVisual;
  /** Envoltório e cores alinhadas ao export HTML Stitch (`Dashboard Refinado`). */
  premiumStitch?: boolean;
}

const STITCH_WINDOW = 30;
const DEFAULT_WINDOW = 14;

export function TokenUsageChart({ data, loading, visual = "default", premiumStitch }: Props) {
  const gid = useId().replace(/:/g, "");
  const gradId = `gradPrompt-${gid}`;
  const stitch = premiumStitch && visual === "default";

  const sortedChartRows = useMemo(() => {
    const byDay = new Map<string, { day: string; prompt: number; completion: number; total: number }>();
    for (const row of data) {
      const label = row.day?.slice(0, 10) ?? "?";
      const existing = byDay.get(label) || { day: label, prompt: 0, completion: 0, total: 0 };
      existing.prompt += row.sum_prompt || 0;
      existing.completion += row.sum_completion || 0;
      existing.total += row.sum_tokens || 0;
      byDay.set(label, existing);
    }
    const sorted = Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
    const win = stitch ? STITCH_WINDOW : DEFAULT_WINDOW;
    return sorted.slice(-win).map((d) => ({
      ...d,
      dayLabel: new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    }));
  }, [data, stitch]);

  const stitchYMax = useMemo(
    () => (sortedChartRows.length ? Math.max(...sortedChartRows.map((r) => r.total), 1) * 1.12 : 1),
    [sortedChartRows],
  );

  const exportCsv = useCallback(() => {
    const header = "dia,prompt,completion,total";
    const rows = sortedChartRows.map((row) =>
      `${row.day},${row.prompt},${row.completion},${row.total}`,
    );
    void navigator.clipboard.writeText([header, ...rows].join("\n"));
    toast.success("Dados exportados para a área de transferência.");
  }, [sortedChartRows]);

  const tooltipStyle =
    stitch
      ? ({
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          fontSize: "12px",
          color: "#0f172a",
        })
      : chartTooltipStyle(visual);

  const stitchChart =
    sortedChartRows.length === 0 ? null : (
      <div className="flex h-[min(280px,42vh)] w-full flex-col lg:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sortedChartRows} margin={{ top: 6, right: 4, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="0" vertical={false} horizontal />
            <XAxis
              dataKey="dayLabel"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tick={{
                fill: "#64748b",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase" as const,
              }}
            />
            <YAxis hide domain={[0, stitchYMax]} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [value.toLocaleString("pt-BR"), "Total de tokens"]}
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.day;
                return typeof iso === "string"
                  ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR")
                  : "";
              }}
            />
            <Area
              type="natural"
              dataKey="total"
              stroke="#7c3aed"
              strokeWidth={3}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2, fill: "#7c3aed" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );

  const composedChart =
    sortedChartRows.length === 0 ? null : (
      <div className="h-[280px] w-full lg:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sortedChartRows} barGap={2}>
            <defs>
              <linearGradient id={`${gradId}-legacy`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0.28} />
                <stop offset="95%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className={chartGridClass(visual)} vertical={false} />
            <XAxis dataKey="dayLabel" axisLine={false} tickLine={false} className={chartAxisTickClass(visual)} />
            <YAxis
              axisLine={false}
              tickLine={false}
              className={chartAxisTickClass(visual)}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            <Tooltip
              contentStyle={chartTooltipStyle(visual)}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { prompt: "Prompt", completion: "Completion", total: "Total" };
                return [value.toLocaleString(), labels[name] || name];
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px" }}
              formatter={(v) => {
                const labels: Record<string, string> = { prompt: "Prompt", completion: "Completion", total: "Total" };
                return labels[v] || v;
              }}
            />
            <Bar dataKey="prompt" fill={visual === "cw" ? "var(--cw-brand)" : "hsl(var(--primary))"} radius={[3, 3, 0, 0]} />
            <Area
              type="monotone"
              dataKey="completion"
              fill={`url(#${gradId}-legacy)`}
              stroke={visual === "cw" ? "var(--cw-series-3)" : "hsl(var(--primary-tint2))"}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke={visual === "cw" ? "var(--cw-series-4)" : "hsl(var(--primary-tint1))"}
              strokeWidth={2}
              dot={{ r: 2.5, fill: visual === "cw" ? "var(--cw-series-4)" : "hsl(var(--primary-tint1))" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );

  const chartArea = loading ? (
    <Skeleton className="h-[300px] w-full rounded-xl" />
  ) : sortedChartRows.length === 0 ? (
    <div
      className={
        stitch
          ? "flex h-[300px] items-center justify-center text-sm text-[#64748b]"
          : visual === "cw"
            ? "flex h-[300px] items-center justify-center text-sm text-cw-slate-10"
            : "flex h-[300px] items-center justify-center text-sm text-muted-foreground"
      }
    >
      Nenhum dado de uso ainda
    </div>
  ) : stitch ? (
    stitchChart
  ) : (
    composedChart
  );

  if (stitch) {
    return (
      <div className="glass-card flex h-full min-h-[250px] flex-col rounded-xl border border-slate-200/60 bg-white p-6 shadow-soft transition-shadow hover:border-[#7c3aed]/25 hover:shadow-md dark:border-border/60 dark:bg-card/40">
        <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-xl font-semibold leading-snug tracking-tight text-[#0f172a] dark:text-foreground">
            Consumo de tokens{" "}
            <span className="block text-[0.9375rem] font-normal text-[#64748b] sm:ml-2 sm:inline dark:text-muted-foreground">
              (30 dias)
            </span>
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-2 rounded-xl border-[#7c3aed]/20 bg-white text-[#7c3aed] shadow-sm hover:bg-[#7c3aed]/5 dark:border-[#c4b5fd]/35 dark:bg-transparent"
            onClick={exportCsv}
          >
            Exportar
            <Ms name="download" className="!text-[18px]" />
          </Button>
        </div>
        <div className="relative w-full min-h-0 flex-1">{chartArea}</div>
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
            <BarChart3 className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary"} />
          </span>
          <div>
            <span className="box-title">Consumo de Tokens</span>
            <p className={subtitleClass(visual)}>Prompt · Completion · Total — 14 dias</p>
          </div>
        </div>
      </div>
      <div className="box-body">{chartArea}</div>
    </div>
  );
}
