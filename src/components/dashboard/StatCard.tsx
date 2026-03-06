import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useCallback } from "react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  accentColor?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  accentColor = "bg-primary",
}: StatCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    cardRef.current!.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    cardRef.current!.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className="dash-card pl-8"
    >
      {/* Left accent bar */}
      <div className={cn("accent-bar", accentColor)} />

      {/* Top row: icon + badge */}
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            iconBg
          )}
        >
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        {change && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-tight",
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

      {/* Value */}
      <p className="metric-value text-2xl font-bold tracking-tight text-foreground">{value}</p>

      {/* Label */}
      <p className="mt-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
    </div>
  );
}
