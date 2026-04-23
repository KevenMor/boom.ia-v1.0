import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";
import type { ModuleAction } from "@/lib/tenant-modules";

export interface UserModuleAclEntry {
  module_key: string;
  enabled: boolean;
  allowed_actions: ModuleAction[] | null;
}

export function useUserModuleAcl(userId: string | null, tenantId: string | null) {
  return useQuery({
    queryKey: ["user-module-acl", userId, tenantId],
    enabled: !!userId && !!tenantId,
    queryFn: async () => {
      const res = await callAPI<{ data: UserModuleAclEntry[] }>(
        `/admin/users/${userId!}/acl?tenant_id=${tenantId!}`,
        { method: "GET" }
      );
      return res.data ?? [];
    },
  });
}

export function useSaveUserModuleAcl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      tenantId: string;
      modules: UserModuleAclEntry[];
    }) => {
      return callAPI<unknown>(`/admin/users/${params.userId}/acl`, {
        method: "PUT",
        body: { tenant_id: params.tenantId, modules: params.modules },
      });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["user-module-acl", vars.userId, vars.tenantId] });
    },
  });
}
