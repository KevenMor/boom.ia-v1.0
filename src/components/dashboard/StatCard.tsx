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

const railClass = {
  positive: "border-l-success",
  negative: "border-l-destructive",
  neutral: "border-l-border",
} as const;

const footerTextClass = {
  positive: "text-success",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
} as const;

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-[128px] flex-col overflow-hidden rounded-lg border border-border bg-card",
        "shadow-[inset_0_1px_0_0_hsl(var(--border)/0.35)]",
        "transition-[box-shadow,border-color] duration-200 hover:border-border hover:shadow-sm",
        "border-l-[3px]",
        railClass[changeType],
      )}
    >
      <div className="flex flex-1 flex-col gap-1 px-4 pb-2 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-muted-foreground">
            {title}
          </span>
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border/80 bg-muted/50 text-muted-foreground"
            aria-hidden
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        </div>
        <p className="mt-1.5 font-semibold tabular-nums tracking-tight text-foreground text-[clamp(1.375rem,2.8vw,1.875rem)] leading-none">
          {value}
        </p>
      </div>
      <div className="mt-auto border-t border-border/70 bg-muted/25 px-4 py-2">
        {change ? (
          <span className={cn("text-[11px] font-medium leading-snug tabular-nums", footerTextClass[changeType])}>
            {change}
          </span>
        ) : (
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">Sem referência</span>
        )}
      </div>
    </div>
  );
}
