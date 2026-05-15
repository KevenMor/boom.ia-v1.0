import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import type { CalendarEvent } from "@/types/calendar";

export function useCalendarEvents(tenantId: string | undefined, calendarIds: string[]) {
  return useQuery({
    queryKey: ["calendar-events", tenantId, calendarIds],
    enabled: !!tenantId && calendarIds.length > 0,
    /** Eventos podem ser criados pela IA / webhooks fora do painel — não segurar cache 10min do app. */
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("tenant_id", tenantId!)
        .in("calendar_id", calendarIds)
        .order("start_at");
      if (error) throw error;
      return data as CalendarEvent[];
    },
  });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (event: Partial<CalendarEvent>) => {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert(event)
        .select()
        .single();
      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["calendar-events", d.tenant_id] });
    },
  });
}

export function useUpdateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CalendarEvent> & { id: string }) => {
      const { data, error } = await supabase
        .from("calendar_events")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["calendar-events", d.tenant_id] });
    },
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => {
      qc.invalidateQueries({ queryKey: ["calendar-events", tenantId] });
    },
  });
}
