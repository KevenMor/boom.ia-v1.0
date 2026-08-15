import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { callAPI } from "@/lib/api-client";
import type { Tenant } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";

export function useTenants() {
  const { user, loading } = useAuth();

  return useQuery({
    queryKey: ["tenants", user?.id ?? null],
    enabled: !loading && !!user,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/503|connection pool|timeout/i.test(msg)) return count < 3;
      return count < 1;
    },
    retryDelay: (i) => Math.min(15_000, 3_000 * (i + 1)),
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const response = await callAPI<{ data: Tenant[] }>("/me/tenants", {
        method: "GET",
        headers: token ? { "x-nexus-auth": `Bearer ${token}` } : {},
      });
      return response.data ?? [];
    },
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenant: Partial<Tenant>) => {
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
