import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HighlightCardProps {
  title: string;
  value: string;
  change?: string;
  icon: LucideIcon;
  gradient: string; // e.g. "from-primary to-primary/80"
}

export function HighlightCard({ title, value, change, icon: Icon, gradient }: HighlightCardProps) {
  return (
    <div className={cn("flex-1 rounded-xl p-5 text-white", `bg-gradient-to-br ${gradient}`)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-white/70">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          {change && (
            <span className="mt-2 inline-flex items-center rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
              {change}
            </span>
          )}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
