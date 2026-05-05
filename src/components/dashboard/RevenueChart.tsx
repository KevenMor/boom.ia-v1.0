import { useId } from "react";
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
import {
  type DashboardVisual,
  chartAxisTickClass,
  chartGridClass,
  chartTooltipStyle,
} from "@/lib/dashboard-visual";

const areaData = [
  { month: "Jul", conversas: 120 },
  { month: "Ago", conversas: 180 },
  { month: "Set", conversas: 240 },
  { month: "Out", conversas: 310 },
  { month: "Nov", conversas: 280 },
  { month: "Dez", conversas: 390 },
  { month: "Jan", conversas: 450 },
];

interface RevenueChartProps {
  visual?: DashboardVisual;
}

export function RevenueChart({ visual = "default" }: RevenueChartProps) {
  const gid = useId().replace(/:/g, "");
  const gradId = `gradConversas-${gid}`;
  const stroke = visual === "cw" ? "var(--cw-brand)" : "hsl(var(--primary-tint2))";

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint2/10"
            }
          >
            <LineChartIcon className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary-tint2"} />
          </span>
          <span className="box-title">Crescimento de Conversas</span>
        </div>
        <div
          className={
            visual === "cw"
              ? "flex overflow-hidden rounded-lg border border-cw-weak text-xs font-medium"
              : "flex overflow-hidden rounded-lg border border-border text-xs font-medium"
          }
        >
          <button
            className={
              visual === "cw"
                ? "bg-cw-brand px-3 py-1.5 text-white"
                : "bg-primary text-primary-foreground px-3 py-1.5"
            }
          >
            Mensal
          </button>
          <button
            className={
              visual === "cw"
                ? "px-3 py-1.5 text-cw-slate-10 hover:bg-cw-solid-2"
                : "px-3 py-1.5 text-muted-foreground hover:bg-muted"
            }
          >
            Anual
          </button>
        </div>
      </div>
      <div className="box-body">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stroke} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className={chartGridClass(visual)} vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} className={chartAxisTickClass(visual)} />
              <YAxis axisLine={false} tickLine={false} className={chartAxisTickClass(visual)} />
              <Tooltip contentStyle={chartTooltipStyle(visual)} />
              <Area
                type="monotone"
                dataKey="conversas"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#${gradId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
