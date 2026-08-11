import { useMemo } from "react";
import { KanbanColumn } from "./KanbanColumn";
import type { KanbanCardData } from "./KanbanCard";
import type { Conversation } from "@/hooks/useConversations";
import {
  displayNameFromConversation,
  resolveConversationContactKey,
} from "@/lib/conversation-display";

const UNASSIGNED_KEY = "__unassigned__";
const AI_KEY = "__ai_agent__";

export interface KanbanColumnModel {
  key: string;
  title: string;
  subtitle?: string;
  variant: "unassigned" | "ai" | "assigned";
  cards: KanbanCardData[];
}

export interface BuildKanbanColumnsOptions {
  /** Nome do agente Boom (IA) selecionado no Kanban. */
  agentName?: string | null;
}

function toCard(
  conv: Conversation,
  contactKey: string,
  assigneeDisplay: string | null,
): KanbanCardData {
  return {
    id: conv.id,
    contactKey,
    title: displayNameFromConversation(conv),
    avatarUrl: conv.contact_avatar_url,
    channel: conv.channel,
    status: conv.status,
    messageCount: conv.message_count ?? 0,
    startedAt: conv.started_at,
    assigneeName: assigneeDisplay,
    labels: conv.labels ?? [],
  };
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Sem assignee no Chatwoot -> Sem atendimento.
 * Assignee cujo nome coincide com o da agente Boom conta como IA.
 * Caso contrário, conta como atendimento humano.
 */
export function classifyKanbanBucket(
  conv: Conversation,
  agentName?: string | null,
): "unassigned" | "ai" | "human" {
  const assignee = conv.chatwoot_assignee_name?.trim() || null;
  if (!assignee) {
    return "unassigned";
  }
  if (agentName && namesMatch(assignee, agentName)) return "ai";
  return "human";
}

/** Deduplica por contato (mesma lógica do Chat ao Vivo) e agrupa por fila / IA / humano. */
export function buildKanbanColumns(
  conversations: Conversation[],
  options: BuildKanbanColumnsOptions = {},
): KanbanColumnModel[] {
  const agentName = options.agentName?.trim() || null;
  const byContact = new Map<string, Conversation>();
  const cwKeyMap = new Map<number, string>();

  for (const conv of conversations) {
    const cwId = conv.chatwoot_conversation_id;
    if (cwId && !cwKeyMap.has(cwId)) {
      cwKeyMap.set(cwId, resolveConversationContactKey(conv));
    }
  }

  for (const conv of conversations) {
    const cwId = conv.chatwoot_conversation_id;
    const contactKey =
      cwId && cwKeyMap.has(cwId) ? cwKeyMap.get(cwId)! : resolveConversationContactKey(conv);
    const existing = byContact.get(contactKey);
    if (!existing) {
      byContact.set(contactKey, conv);
      continue;
    }
    const existingTs = new Date(existing.started_at).getTime();
    const nextTs = new Date(conv.started_at).getTime();
    const prefer =
      nextTs >= existingTs
        ? {
            ...existing,
            ...conv,
            chatwoot_assignee_name: conv.chatwoot_assignee_name || existing.chatwoot_assignee_name,
            labels: Array.from(new Set([...(existing.labels ?? []), ...(conv.labels ?? [])])),
            message_count: Math.max(existing.message_count ?? 0, conv.message_count ?? 0),
          }
        : {
            ...conv,
            ...existing,
            chatwoot_assignee_name: existing.chatwoot_assignee_name || conv.chatwoot_assignee_name,
            labels: Array.from(new Set([...(conv.labels ?? []), ...(existing.labels ?? [])])),
            message_count: Math.max(existing.message_count ?? 0, conv.message_count ?? 0),
          };
    byContact.set(contactKey, prefer as Conversation);
  }

  const buckets = new Map<string, KanbanCardData[]>();
  buckets.set(UNASSIGNED_KEY, []);
  buckets.set(AI_KEY, []);

  for (const [contactKey, conv] of byContact) {
    const bucket = classifyKanbanBucket(conv, agentName);
    if (bucket === "unassigned") {
      buckets.get(UNASSIGNED_KEY)!.push(toCard(conv, contactKey, null));
      continue;
    }
    if (bucket === "ai") {
      buckets.get(AI_KEY)!.push(toCard(conv, contactKey, agentName));
      continue;
    }
    const assignee = conv.chatwoot_assignee_name!.trim();
    const key = `assignee:${assignee.toLowerCase()}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(toCard(conv, contactKey, assignee));
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  const aiTitle = agentName || "Agente IA";
  const columns: KanbanColumnModel[] = [
    {
      key: UNASSIGNED_KEY,
      title: "Sem atendimento",
      subtitle: "Aguardando início",
      variant: "unassigned",
      cards: buckets.get(UNASSIGNED_KEY) ?? [],
    },
    {
      key: AI_KEY,
      title: aiTitle,
      subtitle: "Agente IA",
      variant: "ai",
      cards: buckets.get(AI_KEY) ?? [],
    },
  ];

  const assigneeKeys = Array.from(buckets.keys())
    .filter((k) => k !== UNASSIGNED_KEY && k !== AI_KEY)
    .sort((a, b) => {
      const an = buckets.get(a)?.[0]?.assigneeName ?? a;
      const bn = buckets.get(b)?.[0]?.assigneeName ?? b;
      return an.localeCompare(bn, "pt-BR");
    });

  for (const key of assigneeKeys) {
    const cards = buckets.get(key) ?? [];
    const name = cards[0]?.assigneeName ?? "Atendente";
    columns.push({
      key,
      title: name,
      subtitle: "Atendimento humano",
      variant: "assigned",
      cards,
    });
  }

  return columns;
}

interface BoardProps {
  conversations: Conversation[];
  agentName?: string | null;
  searchTerm?: string;
  onlyOpen?: boolean;
  onOpen: (card: KanbanCardData) => void;
  onDropCard?: (cardId: string, targetColKey: string) => void;
}

export function KanbanBoard({
  conversations,
  agentName = null,
  searchTerm = "",
  onlyOpen = false,
  onOpen,
  onDropCard,
}: BoardProps) {
  const columns = useMemo(() => {
    let rows = conversations;
    if (onlyOpen) rows = rows.filter((c) => c.status === "open");
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      rows = rows.filter((c) => {
        const title = displayNameFromConversation(c).toLowerCase();
        return (
          title.includes(term) ||
          c.crm_display_name?.toLowerCase().includes(term) ||
          c.contact_name?.toLowerCase().includes(term) ||
          c.external_user_id?.toLowerCase().includes(term) ||
          c.chatwoot_assignee_name?.toLowerCase().includes(term) ||
          agentName?.toLowerCase().includes(term) ||
          c.channel?.toLowerCase().includes(term)
        );
      });
    }
    return buildKanbanColumns(rows, { agentName });
  }, [conversations, searchTerm, onlyOpen, agentName]);

  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  const unassigned = columns.find((c) => c.key === UNASSIGNED_KEY)?.cards.length ?? 0;
  const withAi = columns.find((c) => c.key === AI_KEY)?.cards.length ?? 0;
  const humanCols = columns.filter((c) => c.variant === "assigned").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <strong className="font-semibold tabular-nums text-foreground">{total}</strong> contatos
        </span>
        <span className="text-border">·</span>
        <span>
          <strong className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{unassigned}</strong>{" "}
          sem atendimento
        </span>
        <span className="text-border">·</span>
        <span>
          <strong className="font-semibold tabular-nums text-sky-700 dark:text-sky-400">{withAi}</strong> com
          IA
        </span>
        <span className="text-border">·</span>
        <span>
          <strong className="font-semibold tabular-nums text-foreground">{humanCols}</strong>{" "}
          responsáveis
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 scrollbar-none">
        {columns.map((col) => (
          <KanbanColumn
            key={col.key}
            columnKey={col.key}
            title={col.title}
            subtitle={col.subtitle}
            cards={col.cards}
            variant={col.variant}
            onOpen={onOpen}
            onDropCard={onDropCard}
          />
        ))}
      </div>
    </div>
  );
}
