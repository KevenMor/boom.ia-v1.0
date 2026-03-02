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
