import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";
import type { Contact } from "@/types/database";

interface ContactsListParams {
  tenant_id?: string | null;
  limit?: number;
  offset?: number;
  search?: string;
  order_by?: "name" | "updated_at";
  order_dir?: "asc" | "desc";
}

export function useContacts(params: ContactsListParams = {}) {
  const { tenant_id, limit = 100, offset = 0, search, order_by, order_dir } = params;
  const queryParams = new URLSearchParams();
  if (tenant_id) queryParams.set("tenant_id", tenant_id);
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (search?.trim()) queryParams.set("search", search.trim());
  if (order_by) queryParams.set("order_by", order_by);
  if (order_dir) queryParams.set("order_dir", order_dir);

  return useQuery({
    queryKey: ["crm-contacts", tenant_id, limit, offset, search, order_by, order_dir],
    queryFn: async () => {
      const res = await callAPI<{ data: Contact[]; total: number }>(
        `/crm-contacts?${queryParams.toString()}`,
        { method: "GET" }
      );
      return res;
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<Contact>) => {
      const data = await callAPI<Contact>("/crm-contacts", {
        method: "POST",
        body: item,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const data = await callAPI<Contact>(`/crm-contacts/${id}`, {
        method: "PATCH",
        body: updates,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await callAPI(`/crm-contacts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}

export interface ContactConversationPreview {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    model?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  chatwoot_url: string | null;
  agent_name: string | null;
  agent_avatar_url: string | null;
}

export function useContactConversationPreview(contactId: string | null) {
  return useQuery({
    queryKey: ["contact-conversation", contactId],
    queryFn: async () => {
      const res = await callAPI<ContactConversationPreview>(
        `/crm-contacts/${contactId}/conversation-preview`,
        { method: "GET" }
      );
      return res;
    },
    enabled: !!contactId,
  });
}

export function useSyncContactsFromConversations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId?: string | null) => {
      const res = await callAPI<{ success: boolean; synced: number; total_unique: number }>(
        "/crm-contacts/sync-from-conversations",
        { method: "POST", body: tenantId ? { tenant_id: tenantId } : {} }
      );
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}
