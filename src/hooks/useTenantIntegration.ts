import { useQuery } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export interface TenantIntegrationConfig {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  api_base_url: string;
  toggle_secret_configured: boolean;
  toggle_secret: string | null;
  header_name: string;
  endpoints: {
    status: string;
    toggle: string;
  };
  toggle_body_example: {
    tenant_id: string;
    enabled: boolean;
  };
}

export function useTenantIntegration(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-integration", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await callAPI<TenantIntegrationConfig>(
        `/admin/tenants/${tenantId}/integration`,
        { method: "GET" }
      );
      return res;
    },
  });
}
