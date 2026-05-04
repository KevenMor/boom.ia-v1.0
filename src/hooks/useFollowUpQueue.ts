import { useQuery } from "@tanstack/react-query";

export interface FollowUpQueueItem {
  id: string;
  agent_id: string;
  agent_name: string | null;
  conversation_id: string;
  external_user_id: string;
  channel: string;
  chatwoot_conversation_id: number | null;
  attempt: number;
  max_attempts: number;
  scheduled_at: string;
  status: string;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
}

const getApiBase = () =>
  (typeof window !== "undefined" ? "" : import.meta.env.VITE_API_URL ?? "");

export function useFollowUpQueue(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["followup-queue", tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const base = getApiBase();
      const url = `${base}/api/queue/followups/list?tenant_id=${encodeURIComponent(tenantId!)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Falha ao carregar follow-ups");
      }
      const data = await res.json();
      return (data ?? []) as FollowUpQueueItem[];
    },
  });
}
