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
  metadata: { debug?: any[]; edge_logs?: any[] } | null;
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
      return (data ?? []) as Conversation[];
    },
    enabled: !!agentId,
    refetchInterval: 5000,
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
    refetchInterval: 1000,
  });
}

/** Load and merge messages from multiple conversation IDs (unified contact view) */
export function useMultiConversationMessages(agentId: string | null, conversationIds: string[]) {
  return useQuery({
    queryKey: ["multi-conversation-messages", agentId, ...conversationIds],
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
      // Merge all messages and sort by created_at, deduplicate by id
      const seen = new Set<string>();
      const merged: Message[] = [];
      for (const msgs of results) {
        for (const msg of msgs) {
          if (!seen.has(msg.id)) {
            seen.add(msg.id);
            merged.push(msg);
          }
        }
      }
      merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return merged;
    },
    enabled: !!agentId && conversationIds.length > 0,
    refetchInterval: 1000,
  });
}
