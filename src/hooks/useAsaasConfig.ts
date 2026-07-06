import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export type AsaasEnvironment = "sandbox" | "production";

export interface AsaasConfigView {
  environment: AsaasEnvironment;
  api_key_set: boolean;
  wallet_id: string | null;
  account_name: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
}

export function useAsaasConfig(tenantId: string | null | undefined) {
  return useQuery<{ data: AsaasConfigView | null }>({
    queryKey: ["asaas-config", tenantId],
    queryFn: () => callAPI<{ data: AsaasConfigView | null }>(`/payments/asaas/config?tenant_id=${tenantId}`),
    enabled: Boolean(tenantId),
  });
}

export function useSaveAsaasConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      environment: AsaasEnvironment;
      api_key?: string;
      webhook_token?: string | null;
    }) => {
      return callAPI<{ success: true }>(`/payments/asaas/config`, {
        method: "PUT",
        body: input,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["asaas-config", vars.tenant_id] });
    },
  });
}

export function useTestAsaasConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenant_id: string }) => {
      return callAPI<{ ok: boolean; error?: string }>(`/payments/asaas/test`, {
        method: "POST",
        body: input,
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["asaas-config", vars.tenant_id] });
    },
  });
}

export function useRetryInvoiceSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenant_id: string; invoice_id: string; contact_id: string }) => {
      return callAPI<{ success: true }>(`/payments/asaas/invoices/${input.invoice_id}/sync`, {
        method: "POST",
        body: { tenant_id: input.tenant_id },
      });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", vars.contact_id, "invoices"] });
    },
  });
}