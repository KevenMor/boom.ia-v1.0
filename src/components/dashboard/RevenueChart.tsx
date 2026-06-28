import { useId, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationGrowthPoint } from "@/lib/conversation-growth";
import {
  type DashboardVisual,
  chartAxisTickClass,
  chartGridClass,
  chartTooltipStyle,
  emptyStateClass,
} from "@/lib/dashboard-visual";

type GrowthMode = "monthly" | "annual";

interface RevenueChartProps {
  monthlyData?: ConversationGrowthPoint[];
  annualData?: ConversationGrowthPoint[];
  loading?: boolean;
  visual?: DashboardVisual;
}

export function RevenueChart({
  monthlyData = [],
  annualData = [],
  loading = false,
  visual = "default",
}: RevenueChartProps) {
  const [mode, setMode] = useState<GrowthMode>("monthly");
  const gid = useId().replace(/:/g, "");
  const gradId = `gradConversas-${gid}`;
  const stroke = visual === "cw" ? "var(--cw-brand)" : "hsl(var(--primary-tint2))";

  const chartData = useMemo(
    () => (mode === "monthly" ? monthlyData : annualData),
    [annualData, mode, monthlyData],
  );

  const activeBtnClass =
    visual === "cw"
      ? "bg-cw-brand px-3 py-1.5 text-white"
      : "bg-primary text-primary-foreground px-3 py-1.5";
  const inactiveBtnClass =
    visual === "cw"
      ? "px-3 py-1.5 text-cw-slate-10 hover:bg-cw-solid-2"
      : "px-3 py-1.5 text-muted-foreground hover:bg-muted";

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
          <div>
            <span className="box-title">Crescimento de Conversas</span>
            <p className="text-[11px] text-muted-foreground">
              {mode === "monthly" ? "Novas conversas · últimos 7 meses" : "Novas conversas · últimos 4 anos"}
            </p>
          </div>
        </div>
        <div
          className={
            visual === "cw"
              ? "flex overflow-hidden rounded-lg border border-cw-weak text-xs font-medium"
              : "flex overflow-hidden rounded-lg border border-border text-xs font-medium"
          }
        >
          <button type="button" className={mode === "monthly" ? activeBtnClass : inactiveBtnClass} onClick={() => setMode("monthly")}>
            Mensal
          </button>
          <button type="button" className={mode === "annual" ? activeBtnClass : inactiveBtnClass} onClick={() => setMode("annual")}>
            Anual
          </button>
        </div>
      </div>
      <div className="box-body">
        {loading ? (
          <Skeleton className="h-[200px] w-full rounded-md" />
        ) : chartData.every((point) => point.conversas === 0) ? (
          <div className={`${emptyStateClass(visual)} h-[200px]`}>Nenhuma conversa registrada no período</div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stroke} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className={chartGridClass(visual)} vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} className={chartAxisTickClass(visual)} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  className={chartAxisTickClass(visual)}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(visual)}
                  formatter={(value: number) => [value.toLocaleString("pt-BR"), "Conversas"]}
                  labelFormatter={(label) => String(label)}
                />
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
        )}
      </div>
    </div>
  );
}
