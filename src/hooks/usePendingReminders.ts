import { useQuery } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";

export interface PendingReminder {
  id: string;
  calendar_event_id: string;
  event_title: string;
  event_start_at: string;
  remind_at: string;
  status: string;
  external_user_id: string | null;
  agent_id: string;
  created_at: string;
}

export function usePendingReminders(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["pending-reminders", tenantId],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_reminders")
        .select("id, calendar_event_id, event_title, event_start_at, remind_at, status, external_user_id, agent_id, created_at")
        .eq("tenant_id", tenantId!)
        .eq("status", "pending")
        .order("remind_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PendingReminder[];
    },
  });
}
