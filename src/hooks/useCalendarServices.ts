import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export interface CalendarService {
  id: string;
  tenant_id: string;
  name: string;
  duration_minutes: number;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function useCalendarServices(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["calendar-services", tenantId],
    queryFn: async () => {
      const res = await callAPI<{ data: CalendarService[] }>(
        `/calendar-services?tenant_id=${tenantId}`,
        { method: "GET" }
      );
      return res.data ?? [];
    },
    enabled: !!tenantId,
  });
}

export function useCreateCalendarService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { tenant_id: string; name: string; duration_minutes: number; description?: string }) => {
      const data = await callAPI<CalendarService>("/calendar-services", {
        method: "POST",
        body: item,
      });
      return data;
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["calendar-services", vars.tenant_id] }),
  });
}

export function useUpdateCalendarService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CalendarService> & { id: string }) => {
      const data = await callAPI<CalendarService>(`/calendar-services/${id}`, {
        method: "PUT",
        body: updates,
      });
      return data;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["calendar-services", data.tenant_id] }),
  });
}

export function useDeleteCalendarService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      await callAPI(`/calendar-services/${id}`, { method: "DELETE" });
      return { tenantId };
    },
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["calendar-services", vars.tenantId] }),
  });
}
