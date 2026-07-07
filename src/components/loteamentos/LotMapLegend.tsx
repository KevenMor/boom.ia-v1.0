import type { LotStatus } from "@/hooks/useLoteamentos";
import { lotStatusLabel } from "@/hooks/useLoteamentos";

const ITEMS: { status: LotStatus; swatch: string }[] = [
  { status: "available", swatch: "bg-emerald-500" },
  { status: "reserved", swatch: "bg-amber-400" },
  { status: "sold", swatch: "bg-slate-400" },
  { status: "blocked", swatch: "bg-red-500" },
];

export function LotMapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {ITEMS.map((item) => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${item.swatch}`} aria-hidden />
          {lotStatusLabel(item.status)}
        </span>
      ))}
    </div>
  );
}
