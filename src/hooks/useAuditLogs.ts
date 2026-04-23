import { useQuery } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  resource: string;
  resource_id: string | null;
  resource_label: string | null;
  action: "create" | "update" | "delete";
  metadata: Record<string, unknown> | null;
  created_at: string;
  tenants?: { name: string } | null;
}

export interface AuditLogsFilters {
  tenant_id?: string;
  resource?: string;
  action?: string;
  user_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function useAuditLogs(filters: AuditLogsFilters) {
  const params = new URLSearchParams();
  if (filters.tenant_id) params.set("tenant_id", filters.tenant_id);
  if (filters.resource) params.set("resource", filters.resource);
  if (filters.action) params.set("action", filters.action);
  if (filters.user_id) params.set("user_id", filters.user_id);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(filters.limit ?? 50));
  params.set("offset", String(filters.offset ?? 0));

  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () =>
      callAPI<{ data: AuditLog[]; total: number }>(`/audit?${params.toString()}`, { method: "GET" }),
    staleTime: 30_000,
  });
}
