import { useState } from "react";
import { cn } from "@/lib/utils";
import { KanbanCard, type KanbanCardData } from "./KanbanCard";
import { Bot, Inbox, UserRound } from "lucide-react";

interface Props {
  columnKey: string;
  title: string;
  subtitle?: string;
  cards: KanbanCardData[];
  variant: "unassigned" | "ai" | "assigned";
  onOpen: (card: KanbanCardData) => void;
  onDropCard?: (cardId: string, targetColKey: string) => void;
}

export function KanbanColumn({ columnKey, title, subtitle, cards, variant, onOpen, onDropCard }: Props) {
  const [isOver, setIsOver] = useState(false);
  const Icon = variant === "unassigned" ? Inbox : variant === "ai" ? Bot : UserRound;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId && onDropCard) {
          onDropCard(cardId, columnKey);
        }
      }}
      className={cn(
        "flex h-full w-[300px] shrink-0 flex-col rounded-2xl border border-border/80 bg-muted/25 dark:bg-muted/15 transition-all duration-200",
        isOver && "bg-primary/5 border-primary/30 ring-1 ring-primary/20 scale-[1.01]",
      )}
    >
      <header className="flex items-start gap-2.5 border-b border-border/70 px-3.5 py-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
            variant === "unassigned" &&
              "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            variant === "ai" &&
              "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
            variant === "assigned" && "border-border bg-card text-muted-foreground",
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
