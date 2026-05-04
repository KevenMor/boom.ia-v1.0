import { useQuery } from "@tanstack/react-query";

export interface AppointmentReminderItem {
  id: string;
  agent_id: string;
  agent_name: string | null;
  tenant_id: string;
  calendar_event_id: string;
  conversation_id: string;
  external_user_id: string;
  chatwoot_conversation_id: number | null;
  event_title: string;
  event_start_at: string;
  remind_at: string;
  status: string;
  skip_reason?: string | null;
  created_at: string;
  updated_at: string;
}

const getApiBase = () =>
  (typeof window !== "undefined" ? "" : import.meta.env.VITE_API_URL ?? "");

export function useAppointmentRemindersList(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["appointment-reminders", tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const base = getApiBase();
      const url = `${base}/api/queue/reminders/list?tenant_id=${encodeURIComponent(tenantId!)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Falha ao carregar lembretes");
      }
      const data = await res.json();
      return (data ?? []) as AppointmentReminderItem[];
    },
  });
}
