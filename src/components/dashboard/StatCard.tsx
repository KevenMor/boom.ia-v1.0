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
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md">
      {/* Circular icon — Xintra style */}
      <div
        className={cn(
          "mb-4 flex h-12 w-12 items-center justify-center rounded-full",
          iconBg
        )}
      >
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>

      {/* Label */}
      <p className="text-xs font-medium text-muted-foreground">{title}</p>

      {/* Value + Badge inline */}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {change && (
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
              changeType === "positive" &&
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              changeType === "negative" &&
                "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              changeType === "neutral" &&
                "bg-muted text-muted-foreground"
            )}
          >
            {changeType === "positive" && "↑ "}
            {changeType === "negative" && "↓ "}
            {change}
          </span>
        )}
      </div>
    </div>
  );
}
