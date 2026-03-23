import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export type TenantMembershipRole = "tenant_admin" | "tenant_user";

export interface AdminUserMembership {
  id: string;
  tenant_id: string;
  role: string;
  tenants: { name: string } | null;
}

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  created_at: string;
  memberships: AdminUserMembership[];
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await callAPI<{ data: AdminUser[] }>("/admin/users", { method: "GET" });
      return res.data ?? [];
    },
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      email: string;
      password: string;
      full_name?: string | null;
      memberships: Array<{ tenant_id: string; role: TenantMembershipRole }>;
    }) => {
      return callAPI<unknown>("/admin/users", { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      full_name?: string | null;
      memberships?: Array<{ tenant_id: string; role: TenantMembershipRole }>;
    }) => {
      const { id, ...body } = params;
      return callAPI<unknown>(`/admin/users/${id}`, { method: "PATCH", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}
