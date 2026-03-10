import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON_STYLE_MAP: Record<string, { container: string; icon: string }> = {
  "bg-primary": { container: "border-primary/10 bg-primary/10", icon: "text-primary" },
  "bg-secondary": { container: "border-secondary/10 bg-secondary/10", icon: "text-secondary" },
  "bg-amber": { container: "border-amber/10 bg-amber/10", icon: "text-amber" },
  "bg-info": { container: "border-info/10 bg-info/10", icon: "text-info" },
};

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
}: StatCardProps) {
  const iconStyle = ICON_STYLE_MAP[iconBg] ?? ICON_STYLE_MAP["bg-primary"];
  const iconClass = iconStyle.icon;

  return (
    <div className="stat-card group relative flex flex-col text-left px-4 py-5 rounded-2xl border border-border/40 bg-card/70 dark:bg-card/60 transition-all duration-300">
      {/* Top row: icon */}
      <div className="flex justify-between mb-2">
        <div className={cn("p-2 rounded-full", iconStyle.container)}>
          <Icon className={cn("h-5 w-5", iconClass)} />
        </div>
      </div>

      {/* Label */}
      <p className="flex-auto text-muted-foreground text-[14px] mb-0">{title}</p>

      {/* Bottom row: value + badge */}
      <div className="flex items-center justify-between mt-1">
        <h4 className="mb-0 flex items-center text-2xl font-bold text-foreground">{value}</h4>
        {change && (
          <span
            className={cn(
              "badge rounded-full flex items-center gap-0.5 text-[11px] font-medium ms-2 mb-0",
              changeType === "positive" && "bg-success/10 text-success",
              changeType === "negative" && "bg-destructive/10 text-destructive",
              changeType === "neutral" && "bg-muted text-muted-foreground"
            )}
          >
            {changeType === "positive" && (
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M6 9V3M6 3L3 6M6 3l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {changeType === "negative" && (
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
                <path d="M6 3v6M6 9l3-3M6 9L3 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {change}
          </span>
        )}
      </div>
    </div>
  );
}
