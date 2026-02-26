import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tenant } from "@/types/database";

export function useTenants() {
  return useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
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
      // 1. Insert tenant (status = provisioning by default)
      const { data, error } = await supabase
        .from("tenants")
        .insert(tenant)
        .select()
        .single();
      if (error) throw error;

      const created = data as Tenant;

      // 2. Provision Data Plane schema
      const { error: provError } = await supabase.rpc("provision_tenant_schema", {
        p_tenant_id: created.id,
      });
      if (provError) {
        // Cleanup: remove tenant if provisioning fails
        await supabase.from("tenants").delete().eq("id", created.id);
        throw new Error("Falha no provisionamento: " + provError.message);
      }

      // 3. Refetch to get updated status
      const { data: updated } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", created.id)
        .single();

      return (updated ?? created) as Tenant;
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
