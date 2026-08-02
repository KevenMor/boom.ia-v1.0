import { cn } from "@/lib/utils";
import { KanbanCard, type KanbanCardData } from "./KanbanCard";
import { Inbox, UserRound } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  cards: KanbanCardData[];
  variant: "unassigned" | "assigned";
  onOpen: (card: KanbanCardData) => void;
}

export function KanbanColumn({ title, subtitle, cards, variant, onOpen }: Props) {
  const Icon = variant === "unassigned" ? Inbox : UserRound;

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col rounded-2xl border border-border/80 bg-muted/25 dark:bg-muted/15">
      <header className="flex items-start gap-2.5 border-b border-border/70 px-3.5 py-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            variant === "unassigned"
              ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">{title}</h3>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
              {cards.length}
            </span>
          </div>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 scrollbar-none">
        {cards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/80 px-3 py-8 text-center text-xs text-muted-foreground">
            Nenhum atendimento nesta coluna
          </div>
        ) : (
          cards.map((card) => <KanbanCard key={card.id} card={card} onOpen={onOpen} />)
        )}
      </div>
    </div>
  );
}
