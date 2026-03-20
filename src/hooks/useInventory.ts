import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI, getApiBase } from "@/lib/api-client";
import type { InventoryItem } from "@/types/database";

interface InventoryListParams {
  tenant_id?: string | null;
  status?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

export function useInventory(params: InventoryListParams = {}) {
  const { tenant_id, status, limit = 100, offset = 0, search } = params;
  const queryParams = new URLSearchParams();
  if (tenant_id) queryParams.set("tenant_id", tenant_id);
  if (status) queryParams.set("status", status);
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (search?.trim()) queryParams.set("search", search.trim());

  return useQuery({
    queryKey: ["inventory", tenant_id, status, limit, offset, search],
    queryFn: async () => {
      const res = await callAPI<{ data: InventoryItem[]; total: number }>(
        `/inventory?${queryParams.toString()}`,
        { method: "GET" }
      );
      return res;
    },
  });
}

export function useCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<InventoryItem>) => {
      const data = await callAPI<InventoryItem>("/inventory", {
        method: "POST",
        body: item,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useUpdateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
      const data = await callAPI<InventoryItem>(`/inventory/${id}`, {
        method: "PATCH",
        body: updates,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useDeleteInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await callAPI(`/inventory/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}

export function useInventorySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId?: string | null) => {
      const res = await callAPI<{ success: boolean; synced?: number; errors?: number; total?: number; error?: string }>(
        "/inventory/sync",
        { method: "POST", body: tenantId ? { tenant_id: tenantId } : {} }
      );
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });
}
