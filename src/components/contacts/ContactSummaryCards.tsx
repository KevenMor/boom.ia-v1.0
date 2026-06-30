import { Skeleton } from "@/components/ui/skeleton";
import type { ContactSummary } from "@/types/database";
import { cn } from "@/lib/utils";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  summary: ContactSummary | undefined;
  className?: string;
}

export function ContactSummaryCards({ summary, className }: Props) {
  if (!summary) {
    return (
      <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl border border-border bg-border overflow-hidden", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-none bg-card" />
        ))}
      </div>
    );
  }

  const open = Math.max(0, summary.total_invoiced - summary.total_paid);

  const items = [
    { label: "Total pago", value: formatBRL(summary.total_paid), hint: "faturas quitadas" },
    { label: "Em aberto", value: formatBRL(open), hint: open > 0 ? "pendente" : "em dia" },
    { label: "Pacotes", value: String(summary.active_packages), hint: "ativos" },
    { label: "Agenda", value: String(summary.upcoming_appointments), hint: "próximos" },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl border border-border bg-border overflow-hidden",
        className
      )}
      role="list"
    >
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-3.5 min-h-[72px] flex flex-col justify-center" role="listitem">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground mt-0.5">
            {item.value}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
