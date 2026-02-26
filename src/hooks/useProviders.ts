import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Provider } from "@/types/database";

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
      // Create provider first (without api_key)
      const { data, error } = await supabase
        .from("providers")
        .insert({ ...rest, api_key_encrypted: null })
        .select()
        .single();
      if (error) throw error;

      // Encrypt and save API key via edge function
      if (raw_api_key) {
        const { error: fnError } = await supabase.functions.invoke("provider-keys", {
          body: { action: "encrypt", provider_id: data.id, api_key: raw_api_key },
        });
        if (fnError) throw fnError;
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
      // Remove api_key_encrypted from direct updates — it goes through the edge function
      const { api_key_encrypted, ...safeUpdates } = updates as any;

      const { data, error } = await supabase
        .from("providers")
        .update(safeUpdates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Encrypt and save API key via edge function
      if (raw_api_key) {
        const { error: fnError } = await supabase.functions.invoke("provider-keys", {
          body: { action: "encrypt", provider_id: id, api_key: raw_api_key },
        });
        if (fnError) throw fnError;
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
      const { data, error } = await supabase.functions.invoke("provider-keys", {
        body: { action: "decrypt", provider_id: providerId },
      });
      if (error) throw error;
      return data.api_key as string;
    },
  });
}
