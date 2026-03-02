import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

export function TokenUsageChart({ data, loading }: Props) {
  // Aggregate by day across all agents/models
  const byDay = new Map<string, { day: string; prompt: number; completion: number }>();
  for (const row of data) {
    const label = row.day?.slice(0, 10) ?? "?";
    const existing = byDay.get(label) || { day: label, prompt: 0, completion: 0 };
    existing.prompt += row.sum_prompt || 0;
    existing.completion += row.sum_completion || 0;
    byDay.set(label, existing);
  }
  const chartData = Array.from(byDay.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14) // last 14 days
    .map((d) => ({
      ...d,
      day: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    }));

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold">Consumo de Tokens</h2>
        <p className="text-xs text-muted-foreground">prompt vs completion — últimos 14 dias</p>
      </div>
      {loading ? (
        <Skeleton className="h-[220px] w-full rounded-xl" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
          Nenhum dado de uso ainda
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
              <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "10px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number, name: string) => [value.toLocaleString(), name === "prompt" ? "Prompt" : "Completion"]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(v) => (v === "prompt" ? "Prompt" : "Completion")}
              />
              <Bar dataKey="prompt" fill="hsl(262, 72%, 55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completion" fill="hsl(158, 60%, 44%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
