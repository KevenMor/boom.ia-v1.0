import { useQuery } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export interface Conversation {
  id: string;
  channel: string;
  external_user_id: string | null;
  contact_name: string | null;
  contact_avatar_url: string | null;
  chatwoot_conversation_id?: number | null;
  chatwoot_contact_id?: number | null;
  labels?: string[];
  chatwoot_assignee_name?: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  message_count: number;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  model: string | null;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number | null;
  created_at: string;
  metadata: { debug?: any[]; token_usage?: Record<string, unknown>; chatwoot_message_id?: string; attachments?: unknown[] } | null;
}

export function useConversations(agentId: string | null) {
  return useQuery({
    queryKey: ["conversations", agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await nexusDb.rpc("list_agent_conversations", {
        p_agent_id: agentId,
        p_limit: 100,
      });
      if (error) throw error;
      const convs = (data ?? []) as Conversation[];
      return convs;
    },
    enabled: !!agentId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
}

export function useConversationMessages(agentId: string | null, conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation-messages", agentId, conversationId],
    queryFn: async () => {
      if (!agentId || !conversationId) return [];
      const { data, error } = await nexusDb.rpc("load_conversation_messages", {
        p_agent_id: agentId,
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!agentId && !!conversationId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
}

/** Load and merge messages from multiple conversation IDs (unified contact view) */
export function useMultiConversationMessages(agentId: string | null, conversationIds: string[]) {
  const stableKey = conversationIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["multi-conversation-messages", agentId, stableKey],
    queryFn: async () => {
      if (!agentId || conversationIds.length === 0) return [];
      const results = await Promise.all(
        conversationIds.map(async (cid) => {
          const { data, error } = await nexusDb.rpc("load_conversation_messages", {
            p_agent_id: agentId,
            p_conversation_id: cid,
          });
          if (error) throw error;
          return (data ?? []) as Message[];
        })
      );
      // Merge all messages and sort by created_at; deduplicate by id, contentKey, and chatwoot_message_id (evita duplicata de foto/áudio)
      const seenIds = new Set<string>();
      const seenContentKeys = new Set<string>();
      const byChatwootId = new Map<string, Message>();
      const BUCKET_MS = 5000;
      const contentKey = (m: Message) =>
        `${m.role}\t${(m.content || "").trim()}\t${Math.floor(new Date(m.created_at).getTime() / BUCKET_MS)}`;
      const prefersOver = (a: Message, b: Message): boolean => {
        const aHasTranscription = /\[Áudio\s+(transcrito|do cliente)/i.test(a.content || "");
        const bHasTranscription = /\[Áudio\s+(transcrito|do cliente)/i.test(b.content || "");
        if (aHasTranscription && !bHasTranscription) return true;
        if (!aHasTranscription && bHasTranscription) return false;
        const aHasAttachments = ((a.metadata as { attachments?: unknown[] })?.attachments?.length ?? 0) > 0;
        const bHasAttachments = ((b.metadata as { attachments?: unknown[] })?.attachments?.length ?? 0) > 0;
        return aHasAttachments && !bHasAttachments;
      };
      const merged: Message[] = [];
      for (const msgs of results) {
        for (const msg of msgs) {
          const ck = contentKey(msg);
          const cwId = (msg.metadata as { chatwoot_message_id?: string } | null)?.chatwoot_message_id;
          if (seenIds.has(msg.id) || seenContentKeys.has(ck)) continue;
          if (cwId) {
            const existing = byChatwootId.get(cwId);
            if (existing) {
              if (prefersOver(msg, existing)) {
                const idx = merged.findIndex((m) => m.id === existing.id);
                if (idx >= 0) merged.splice(idx, 1);
                seenIds.delete(existing.id);
                seenContentKeys.delete(contentKey(existing));
                byChatwootId.set(cwId, msg);
                seenIds.add(msg.id);
                seenContentKeys.add(ck);
                merged.push(msg);
              }
              continue;
            }
            byChatwootId.set(cwId, msg);
          }
          seenIds.add(msg.id);
          seenContentKeys.add(ck);
          merged.push(msg);
        }
      }
      merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return merged;
    },
    enabled: !!agentId && conversationIds.length > 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
}

