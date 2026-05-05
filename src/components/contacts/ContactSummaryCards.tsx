import { DollarSign, Package, CalendarDays, Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ContactSummary } from "@/types/database";

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
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${className ?? ""}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total Pago",
      value: formatBRL(summary.total_paid),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Em Aberto",
      value: formatBRL(summary.total_invoiced - summary.total_paid),
      icon: Receipt,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Pacotes Ativos",
      value: String(summary.active_packages),
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Próx. Agendamentos",
      value: String(summary.upcoming_appointments),
      icon: CalendarDays,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 ${className ?? ""}`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card p-4 flex items-center gap-3"
        >
          <div className={`rounded-md p-2 ${card.bg}`}>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{card.label}</p>
            <p className="text-sm font-semibold leading-tight truncate">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
