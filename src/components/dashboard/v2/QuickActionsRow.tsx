import { Link } from "react-router-dom";
import { Columns3, MessageSquare, Bot } from "lucide-react";

const ACTIONS = [
  {
    to: "/kanban",
    label: "Kanban",
    description: "Fila por responsável",
    icon: Columns3,
  },
  {
    to: "/conversations",
    label: "Chat ao vivo",
    description: "Atender agora",
    icon: MessageSquare,
  },
  {
    to: "/agents",
    label: "Agentes",
    description: "Capacidade e status",
    icon: Bot,
  },
] as const;

export function QuickActionsRow() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.to}
            to={action.to}
            className="tu-kpi group flex items-center gap-3 px-4 py-3.5 no-underline transition-colors"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/75 transition-colors group-hover:text-primary">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium tracking-[-0.01em] text-foreground">
                {action.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                {action.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
