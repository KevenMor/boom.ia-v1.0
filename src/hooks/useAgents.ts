import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Agent } from "@/types/database";

export function useAgents(tenantId?: string) {
  return useQuery({
    queryKey: ["agents", tenantId],
    queryFn: async () => {
      let query = supabase
        .from("agents")
        .select("*, tenants(name, slug), providers(name)")
        .order("created_at", { ascending: false });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return data as Agent[];
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agent: Partial<Agent>) => {
      const { data, error } = await supabase.from("agents").insert(agent).select("*, tenants(name, slug), providers(name)").single();
      if (error) throw error;
      return data as Agent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Agent> & { id: string }) => {
      const { data, error } = await supabase
        .from("agents")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*, tenants(name, slug), providers(name)")
        .single();
      if (error) throw error;
      return data as Agent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}
