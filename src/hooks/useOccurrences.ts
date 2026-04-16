import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";
import type { Occurrence } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";

export interface OccurrencesListParams {
  tenant_id?: string | null;
  inventory_id?: string;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export function useOccurrences(params: OccurrencesListParams = {}) {
  const { isSuperAdmin } = useAuth();
  const { tenant_id, inventory_id, status, severity, limit = 100, offset = 0, search } = params;
  const queryParams = new URLSearchParams();
  if (tenant_id) queryParams.set("tenant_id", tenant_id);
  if (inventory_id) queryParams.set("inventory_id", inventory_id);
  if (status) queryParams.set("status", status);
  if (severity) queryParams.set("severity", severity);
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (search?.trim()) queryParams.set("search", search.trim());

  return useQuery({
    queryKey: ["occurrences", tenant_id, inventory_id, status, severity, limit, offset, search],
    queryFn: async () => {
      const res = await callAPI<{ data: Occurrence[]; total: number }>(
        `/occurrences?${queryParams.toString()}`,
        { method: "GET" }
      );
      return res;
    },
    enabled: isSuperAdmin || Boolean(tenant_id),
  });
}

export function useCreateOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      tenant_id: string;
      inventory_id: string;
      title: string;
      description?: string | null;
      status?: string;
      severity?: string;
      occurred_at?: string;
      location_type?: string;
      location_detail?: string | null;
      odometer_km?: number | null;
      photo_urls?: string[];
      contact_id?: string | null;
    }) => {
      return callAPI<Occurrence>("/occurrences", { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["occurrences"] }),
  });
}

export function useUpdateOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<{
      title: string;
      description: string | null;
      status: string;
      severity: string;
      occurred_at: string;
      inventory_id: string;
      location_type: string;
      location_detail: string | null;
      odometer_km: number | null;
      photo_urls?: string[];
      contact_id: string | null;
    }> & { id: string }) => {
      return callAPI<Occurrence>(`/occurrences/${id}`, { method: "PATCH", body: updates });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["occurrences"] }),
  });
}

export function useDeleteOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await callAPI(`/occurrences/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["occurrences"] }),
  });
}
