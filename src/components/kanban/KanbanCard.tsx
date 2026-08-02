import { cn } from "@/lib/utils";
import { ContactConversationAvatar } from "@/components/chat/ContactConversationAvatar";
import { initialsFromName } from "@/lib/conversation-display";
import { MessageSquare } from "lucide-react";

export interface KanbanCardData {
  id: string;
  contactKey: string;
  title: string;
  avatarUrl?: string | null;
  channel?: string | null;
  status: string;
  messageCount: number;
  startedAt: string;
  assigneeName: string | null;
  labels?: string[];
}

function relativeLabel(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

interface Props {
  card: KanbanCardData;
  onOpen: (card: KanbanCardData) => void;
}

export function KanbanCard({ card, onOpen }: Props) {
  const open = card.status === "open";
  const initials = initialsFromName(card.title);

  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className={cn(
        "group w-full rounded-xl border border-border/80 bg-card p-3 text-left shadow-sm",
        "transition-all duration-150",
        "hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start gap-3">
        <ContactConversationAvatar
          url={card.avatarUrl}
          name={card.title}
          initials={initials}
          className="h-9 w-9 text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">{card.title}</p>
            <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
              {relativeLabel(card.startedAt)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                open
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-emerald-500" : "bg-muted-foreground/50")} />
              {open ? "Aberto" : card.status || "Fechado"}
            </span>
            {card.channel ? (
              <span className="truncate rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {card.channel}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={2} />
            <span className="tabular-nums">{card.messageCount} msgs</span>
            {card.assigneeName ? (
              <>
                <span className="text-border">·</span>
                <span className="truncate font-medium text-foreground/80">{card.assigneeName}</span>
              </>
            ) : null}
          </div>
          {card.labels && card.labels.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.labels.slice(0, 3).map((lbl) => (
                <span
                  key={lbl}
                  className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {lbl}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
