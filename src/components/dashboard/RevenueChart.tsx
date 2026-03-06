import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";

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
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint2/10">
            <LineChartIcon className="h-4 w-4 text-primary-tint2" />
          </span>
          <span className="box-title">Crescimento de Conversas</span>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
          <button className="bg-primary text-primary-foreground px-3 py-1.5">Mensal</button>
          <button className="px-3 py-1.5 text-muted-foreground hover:bg-muted">Anual</button>
        </div>
      </div>
      <div className="box-body">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="gradConversas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary-tint2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
              <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Area
                type="monotone"
                dataKey="conversas"
                stroke="hsl(var(--primary-tint2))"
                strokeWidth={2}
                fill="url(#gradConversas)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
