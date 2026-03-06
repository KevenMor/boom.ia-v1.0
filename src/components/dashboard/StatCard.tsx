import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  accentColor?: string;
  sparkData?: number[];
  sparkColor?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  sparkData = [25, 44, 30, 56, 40, 50, 13, 24, 84],
  sparkColor,
}: StatCardProps) {
  const resolvedSparkColor = sparkColor ?? "hsl(var(--primary))";

  return (
    <div className="box overflow-hidden">
      <div className="box-body pb-0 pe-0">
        {/* Top: icon + label */}
        <div className="mb-4 flex justify-between items-start flex-wrap">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", iconBg)}>
            <Icon className={cn("h-[18px] w-[18px]", iconColor)} />
          </span>
          <span className="text-[13px] font-medium text-muted-foreground pe-4">{title}</span>
        </div>

        {/* Bottom: value + trend + sparkline */}
        <div className="flex items-end justify-between">
          <div className="pb-3">
            <p className="metric-value text-xl font-semibold text-foreground mb-1">{value}</p>
            {change && (
              <div
                className={cn(
                  "trend-pill",
                  changeType === "positive" && "trend-pill-positive",
                  changeType === "negative" && "trend-pill-negative",
                  changeType === "neutral" && "trend-pill-neutral"
                )}
              >
                {change}
                {changeType === "positive" && " ↑"}
                {changeType === "negative" && " ↓"}
              </div>
            )}
          </div>

          {/* Mini sparkline */}
          <div className="w-[100px] h-[70px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData.map((v, i) => ({ v, i }))}>
                <defs>
                  <linearGradient id={`spark-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={resolvedSparkColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={resolvedSparkColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={resolvedSparkColor}
                  strokeWidth={1.5}
                  fill={`url(#spark-${title.replace(/\s/g, "")})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
