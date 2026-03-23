import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { callAPI } from "@/lib/api-client";
import type { Tenant } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";

export function useTenants() {
  const { user, isSuperAdmin, memberships, loading } = useAuth();

  return useQuery({
    queryKey: ["tenants", user?.id ?? null, isSuperAdmin, memberships.length],
    enabled: !loading && !!user,
    queryFn: async () => {
      if (isSuperAdmin) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await callAPI<{ data: Tenant[] }>("/admin/tenants", {
          method: "GET",
          headers: token ? { "x-nexus-auth": `Bearer ${token}` } : {},
        });
        return response.data ?? [];
      }

      const tenantIds = memberships.map((m) => m.tenant_id);
      if (tenantIds.length === 0) return [] as Tenant[];

      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .in("id", tenantIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tenant[];
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: Partial<Tenant>) => {
      // Insert tenant – trigger trg_provision_tenant_on_insert provisiona o schema automaticamente
      const { data, error } = await supabase
        .from("tenants")
        .insert(tenant)
        .select()
        .single();
      if (error) throw error;

      // Refetch para obter status atualizado (db_name preenchido pelo provisionamento)
      const { data: updated } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", data.id)
        .single();

      return (updated ?? data) as Tenant;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Tenant;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // 1. Deprovision schema first
      const { error: deprovError } = await supabase.rpc("deprovision_tenant_schema", {
        p_tenant_id: id,
      });
      // Log but don't block deletion if deprov fails
      if (deprovError) {
        console.warn("Deprovision warning:", deprovError.message);
      }

      // 2. Delete tenant record
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
