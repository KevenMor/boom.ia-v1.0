import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  iconBg = "bg-primary",
  iconColor = "text-primary-foreground",
}: StatCardProps) {
  return (
    <div className="stat-card group relative flex flex-col items-center text-center px-4 py-5 rounded-2xl border border-border/40 bg-card/70 dark:bg-card/60 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.15)]">
      {/* Icon circle */}
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full shadow-lg mb-3 transition-transform duration-300 group-hover:scale-110",
        iconBg
      )}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>

      {/* Trend badge */}
      {change && (
        <div className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold mb-3",
          changeType === "positive" && "bg-success/15 text-success",
          changeType === "negative" && "bg-destructive/15 text-destructive",
          changeType === "neutral" && "bg-muted text-muted-foreground",
        )}>
          {changeType === "positive" && (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M6 9V3M6 3L3 6M6 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {changeType === "negative" && (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M6 3v6M6 9l3-3M6 9L3 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {change}
        </div>
      )}

      {/* Metric value */}
      <p className="metric-value text-2xl font-bold text-foreground mb-1">{value}</p>

      {/* Label */}
      <p className="text-xs text-muted-foreground font-medium">{title}</p>
    </div>
  );
}
