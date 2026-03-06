import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart as RechartsLineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

export function TokenUsageChart({ data, loading }: Props) {
  const byDay = new Map<string, { day: string; prompt: number; completion: number; total: number }>();
  for (const row of data) {
    const label = row.day?.slice(0, 10) ?? "?";
    const existing = byDay.get(label) || { day: label, prompt: 0, completion: 0, total: 0 };
    existing.prompt += row.sum_prompt || 0;
    existing.completion += row.sum_completion || 0;
    existing.total += row.sum_tokens || 0;
    byDay.set(label, existing);
  }
  const chartData = Array.from(byDay.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14)
    .map((d) => ({
      ...d,
      day: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    }));

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </span>
          <div>
            <span className="box-title">Consumo de Tokens</span>
            <p className="text-[11px] text-muted-foreground">Prompt · Completion · Total — 14 dias</p>
          </div>
        </div>
      </div>
      <div className="box-body">
        {loading ? (
          <Skeleton className="h-[300px] w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Nenhum dado de uso ainda
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2}>
                <defs>
                  <linearGradient id="gradPrompt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
                <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(var(--popover-foreground))",
                  }}
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
                {/* Bars for prompt tokens */}
                <Bar dataKey="prompt" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                {/* Area for completion */}
                <Area type="monotone" dataKey="completion" fill="url(#gradPrompt)" stroke="hsl(var(--primary-tint2))" strokeWidth={2} />
                {/* Line for total */}
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary-tint1))" strokeWidth={2} dot={{ r: 2.5, fill: "hsl(var(--primary-tint1))" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
