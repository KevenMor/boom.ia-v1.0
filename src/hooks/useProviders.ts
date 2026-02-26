import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { cloudClient } from "@/integrations/supabase/cloud-client";
import type { Provider } from "@/types/database";

async function invokeProviderKeys(body: Record<string, unknown>) {
  // Get the auth token from the self-hosted session
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const { data, error } = await cloudClient.functions.invoke("provider-keys", {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (error) throw error;
  return data;
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Provider[];
    },
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: Partial<Provider> & { raw_api_key?: string }) => {
      const { raw_api_key, ...rest } = provider;
      const { data, error } = await supabase
        .from("providers")
        .insert({ ...rest, api_key_encrypted: null })
        .select()
        .single();
      if (error) throw error;

      if (raw_api_key) {
        await invokeProviderKeys({ action: "encrypt", provider_id: data.id, api_key: raw_api_key });
      }

      return data as Provider;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, raw_api_key, ...updates }: Partial<Provider> & { id: string; raw_api_key?: string }) => {
      const { api_key_encrypted, ...safeUpdates } = updates as any;

      const { data, error } = await supabase
        .from("providers")
        .update(safeUpdates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (raw_api_key) {
        await invokeProviderKeys({ action: "encrypt", provider_id: id, api_key: raw_api_key });
      }

      return data as Provider;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("providers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers"] }),
  });
}

export function useDecryptProviderKey() {
  return useMutation({
    mutationFn: async (providerId: string) => {
      const result = await invokeProviderKeys({ action: "decrypt", provider_id: providerId });
      return result.api_key as string;
    },
  });
}
