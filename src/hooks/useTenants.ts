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
      // Call backend endpoint to bypass RLS (uses SERVICE_ROLE_KEY)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { "x-nexus-auth": `Bearer ${token}` }),
        },
        body: JSON.stringify({
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          description: tenant.description,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create tenant");
      }

      const data = await response.json();

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/admin/tenants/${id}`, {
        method: "DELETE",
        headers: {
          ...(token && { "x-nexus-auth": `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete tenant");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}
