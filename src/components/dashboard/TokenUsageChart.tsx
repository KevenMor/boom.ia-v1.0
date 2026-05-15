import { useCallback, useId, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";
import { toast } from "sonner";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
  visual?: string;
  premiumStitch?: boolean;
}

export function TokenUsageChart({ data, loading }: Props) {
  const gid = useId().replace(/:/g, "");
  const gradId = `grad-${gid}`;

  const sortedChartRows = useMemo(() => {
    const byDay = new Map<string, { day: string; total: number }>();
    for (const row of data) {
      const label = row.day?.slice(0, 10) ?? "?";
      const existing = byDay.get(label) || { day: label, total: 0 };
      existing.total += row.sum_tokens || 0;
      byDay.set(label, existing);
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-30)
      .map((d) => ({
        ...d,
        dayLabel: new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      }));
  }, [data]);

  const exportCsv = useCallback(() => {
    const header = "dia,total";
    const rows = sortedChartRows.map((row) => `${row.day},${row.total}`);
    void navigator.clipboard.writeText([header, ...rows].join("\n"));
    toast.success("Dados copiados.");
  }, [sortedChartRows]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[300px] flex-col rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    );
  }

  if (sortedChartRows.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-border bg-card p-5">
        <span className="text-sm text-muted-foreground">Nenhum dado de uso ainda</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-md font-medium text-foreground">Consumo de tokens</h3>
          <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          Exportar →
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sortedChartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="dayLabel"
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "5px",
                fontSize: "12px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number) => [value.toLocaleString("pt-BR"), "Tokens"]}
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.day;
                return typeof iso === "string"
                  ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR")
                  : "";
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
