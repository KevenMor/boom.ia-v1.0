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
  metadata: { debug?: any[]; token_usage?: Record<string, unknown> } | null;
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
      // Merge all messages and sort by created_at; deduplicate by id and by (role, content, time bucket)
      const seenIds = new Set<string>();
      const BUCKET_MS = 5000;
      const contentKey = (m: Message) =>
        `${m.role}\t${m.content}\t${Math.floor(new Date(m.created_at).getTime() / BUCKET_MS)}`;
      const seenContentKeys = new Set<string>();
      const merged: Message[] = [];
      for (const msgs of results) {
        for (const msg of msgs) {
          const ck = contentKey(msg);
          if (seenIds.has(msg.id) || seenContentKeys.has(ck)) continue;
          seenIds.add(msg.id);
          seenContentKeys.add(ck);
          merged.push(msg);
        }
      }
      merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      // #region agent log
      const assistantMsgs = merged.filter((m) => m.role === "assistant");
      fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'12d224'},body:JSON.stringify({sessionId:'12d224',location:'useConversations.ts:merged',message:'merged messages',data:{total:merged.length,assistantCount:assistantMsgs.length,assistantIds:assistantMsgs.map(m=>m.id),convIds:conversationIds},timestamp:Date.now(),hypothesisId:'H1,H3,H4'})}).catch(()=>{});
      // #endregion
      return merged;
    },
    enabled: !!agentId && conversationIds.length > 0,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });
}

