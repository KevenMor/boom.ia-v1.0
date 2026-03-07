import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { useTenantContext } from "@/contexts/TenantContext";

export interface AppNotification {
  id: string;
  type: "reminder" | "system";
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  /** original row id for dismiss / mark-read */
  source_id?: string;
  meta?: Record<string, unknown>;
}

export function useNotifications() {
  const { selectedTenantId } = useTenantContext();

  return useQuery<AppNotification[]>({
    queryKey: ["notifications", selectedTenantId],
    enabled: !!selectedTenantId,
    refetchInterval: 30_000, // poll every 30s
    queryFn: async () => {
      const notifications: AppNotification[] = [];

      // 1️⃣ Appointment reminders — upcoming (next 48h) or recently failed
      const now = new Date();
      const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const { data: reminders } = await supabase
        .from("appointment_reminders")
        .select("*")
        .eq("tenant_id", selectedTenantId!)
        .in("status", ["pending", "failed"])
        .lte("remind_at", in48h.toISOString())
        .order("remind_at", { ascending: true })
        .limit(50);

      if (reminders) {
        for (const r of reminders) {
          const isFailed = r.status === "failed";
          notifications.push({
            id: `rem-${r.id}`,
            type: isFailed ? "system" : "reminder",
            title: isFailed ? "⚠️ Falha no lembrete" : "🔔 Lembrete pendente",
            body: `${r.event_title} — ${new Date(r.event_start_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
            created_at: r.created_at,
            read: false,
            source_id: r.id,
            meta: { status: r.status, event_start_at: r.event_start_at },
          });
        }
      }

      // 2️⃣ System alerts — conversations stuck (no messages for >24h with pending status)
      // We'll add more sources over time; for now reminders cover the main use-case

      return notifications.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
}

/** Locally-managed read state (persisted in localStorage) */
const READ_KEY = "boomia_read_notifications";

export function getReadIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function markAsRead(id: string) {
  const ids = getReadIds();
  ids.add(id);
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

export function markAllAsRead(notifications: AppNotification[]) {
  const ids = getReadIds();
  notifications.forEach((n) => ids.add(n.id));
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}
