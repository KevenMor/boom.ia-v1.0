import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Timer } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

export function LatencyChart({ data, loading }: Props) {
  const byDay = new Map<string, { day: string; totalLatency: number; totalReqs: number; maxP95: number }>();
  for (const row of data) {
    if (row.phase !== "conversational") continue;
    const label = row.day?.slice(0, 10) ?? "?";
    const existing = byDay.get(label) || { day: label, totalLatency: 0, totalReqs: 0, maxP95: 0 };
    existing.totalLatency += (row.avg_latency_ms || 0) * (row.total_requests || 0);
    existing.totalReqs += row.total_requests || 0;
    existing.maxP95 = Math.max(existing.maxP95, row.p95_latency_ms || 0);
    byDay.set(label, existing);
  }

  const chartData = Array.from(byDay.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14)
    .map((d) => ({
      day: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      avg: d.totalReqs > 0 ? Math.round(d.totalLatency / d.totalReqs) : 0,
      p95: Math.round(d.maxP95),
    }));

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
            <Timer className="h-4 w-4 text-warning" />
          </span>
          <div>
            <span className="box-title">Latência</span>
            <p className="text-[11px] text-muted-foreground">Média vs P95 — últimos 14 dias</p>
          </div>
        </div>
      </div>
      <div className="box-body">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Nenhum dado de latência ainda
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
                <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" unit="ms" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                  formatter={(value: number, name: string) => [`${value.toLocaleString()}ms`, name === "avg" ? "Média" : "P95"]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} formatter={(v) => (v === "avg" ? "Média" : "P95")} />
                <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                <Line type="monotone" dataKey="p95" stroke="hsl(var(--primary-tint1))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary-tint1))" }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
