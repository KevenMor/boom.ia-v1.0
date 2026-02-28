import { Card } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const areaData = [
  { month: "Jul", conversas: 120 },
  { month: "Ago", conversas: 180 },
  { month: "Set", conversas: 240 },
  { month: "Out", conversas: 310 },
  { month: "Nov", conversas: 280 },
  { month: "Dez", conversas: 390 },
  { month: "Jan", conversas: 450 },
];

export function RevenueChart() {
  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Crescimento de Conversas</h2>
          <p className="text-xs text-muted-foreground">tendência de volume mensal</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
          <button className="bg-foreground px-3 py-1.5 text-background">Mensal</button>
          <button className="px-3 py-1.5 text-muted-foreground hover:bg-muted">Anual</button>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={areaData}>
            <defs>
              <linearGradient id="gradConversasFlux" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(270, 70%, 60%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(270, 70%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              className="text-[11px] fill-muted-foreground"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              className="text-[11px] fill-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "10px",
                fontSize: "12px",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Area
              type="monotone"
              dataKey="conversas"
              stroke="hsl(270, 70%, 60%)"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#gradConversasFlux)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
