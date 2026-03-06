import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Cpu } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

const DONUT_COLORS = [
  "hsl(296, 68%, 61%)",  // tint1
  "hsl(236, 92%, 66%)",  // primary
  "hsl(340, 100%, 68%)", // tint2
  "hsl(16, 100%, 72%)",  // tint3
  "hsl(268, 90%, 66%)",  // secondary
  "hsl(199, 89%, 48%)",  // info
];

export function ModelBreakdown({ data, loading }: Props) {
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

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Cpu className="h-4 w-4 text-primary" />
          </span>
          <span className="box-title">Uso por Modelo</span>
        </div>
      </div>
      <div className="box-body">
        {loading ? (
          <Skeleton className="h-[260px] w-full rounded-xl" />
        ) : models.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Donut chart */}
            <div className="h-[180px] w-[180px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(value: number) => [fmt(value), "tokens"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend table */}
            <div className="w-full space-y-2">
              {models.slice(0, 6).map((m, idx) => {
                const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
                return (
                  <div key={m.model} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                    />
                    <span className="flex-1 truncate text-xs" title={m.model}>{m.model}</span>
                    <span className="metric-value text-xs text-muted-foreground shrink-0">{fmt(m.tokens)}</span>
                    <span className="metric-value text-xs font-medium text-success shrink-0">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
