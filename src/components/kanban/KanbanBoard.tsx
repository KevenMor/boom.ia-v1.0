import { useMemo } from "react";
import { KanbanColumn } from "./KanbanColumn";
import type { KanbanCardData } from "./KanbanCard";
import type { Conversation } from "@/hooks/useConversations";
import {
  displayNameFromConversation,
  resolveConversationContactKey,
} from "@/lib/conversation-display";

const UNASSIGNED_KEY = "__unassigned__";

export interface KanbanColumnModel {
  key: string;
  title: string;
  subtitle?: string;
  variant: "unassigned" | "assigned";
  cards: KanbanCardData[];
}

function toCard(conv: Conversation, contactKey: string): KanbanCardData {
  return {
    id: conv.id,
    contactKey,
    title: displayNameFromConversation(conv),
    avatarUrl: conv.contact_avatar_url,
    channel: conv.channel,
    status: conv.status,
    messageCount: conv.message_count ?? 0,
    startedAt: conv.started_at,
    assigneeName: conv.chatwoot_assignee_name?.trim() || null,
    labels: conv.labels ?? [],
  };
}

/** Deduplica por contato (mesma lógica do Chat ao Vivo) e agrupa por assignee. */
export function buildKanbanColumns(conversations: Conversation[]): KanbanColumnModel[] {
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

  for (const [contactKey, conv] of byContact) {
    const assignee = conv.chatwoot_assignee_name?.trim() || null;
    const key = assignee ? `assignee:${assignee.toLowerCase()}` : UNASSIGNED_KEY;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(toCard(conv, contactKey));
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  const columns: KanbanColumnModel[] = [
    {
      key: UNASSIGNED_KEY,
      title: "Sem atendimento",
      subtitle: "Aguardando responsável",
      variant: "unassigned",
      cards: buckets.get(UNASSIGNED_KEY) ?? [],
    },
  ];

  const assigneeKeys = Array.from(buckets.keys())
    .filter((k) => k !== UNASSIGNED_KEY)
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
      subtitle: "Com atendimento",
      variant: "assigned",
      cards,
    });
  }

  return columns;
}

interface BoardProps {
  conversations: Conversation[];
  searchTerm?: string;
  onlyOpen?: boolean;
  onOpen: (card: KanbanCardData) => void;
}

export function KanbanBoard({ conversations, searchTerm = "", onlyOpen = false, onOpen }: BoardProps) {
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
          c.channel?.toLowerCase().includes(term)
        );
      });
    }
    return buildKanbanColumns(rows);
  }, [conversations, searchTerm, onlyOpen]);

  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  const unassigned = columns[0]?.cards.length ?? 0;

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
          <strong className="font-semibold tabular-nums text-foreground">{Math.max(0, columns.length - 1)}</strong>{" "}
          responsáveis
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 scrollbar-none">
        {columns.map((col) => (
          <KanbanColumn
            key={col.key}
            title={col.title}
            subtitle={col.subtitle}
            cards={col.cards}
            variant={col.variant}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
