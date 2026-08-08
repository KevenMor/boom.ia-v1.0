import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";
import type { Contact, ContactType, ContactInvoice, ContactPackage, ContactSummary, ContactDocument, ContactContract } from "@/types/database";
import type { CalendarEvent } from "@/types/calendar";

interface ContactsListParams {
  tenant_id?: string | null;
  limit?: number;
  offset?: number;
  search?: string;
  order_by?: "name" | "updated_at";
  order_dir?: "asc" | "desc";
  type?: ContactType;
  /** Se false, não executa o pedido (ex.: sem tenant seleccionado). */
  queryEnabled?: boolean;
}

export function useContacts(params: ContactsListParams = {}) {
  const { tenant_id, limit = 100, offset = 0, search, order_by, order_dir, type, queryEnabled = true } = params;
  const queryParams = new URLSearchParams();
  if (tenant_id) queryParams.set("tenant_id", tenant_id);
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (search?.trim()) queryParams.set("search", search.trim());
  if (order_by) queryParams.set("order_by", order_by);
  if (order_dir) queryParams.set("order_dir", order_dir);
  if (type) queryParams.set("type", type);

  return useQuery({
    queryKey: ["crm-contacts", tenant_id, limit, offset, search, order_by, order_dir, type],
    queryFn: async () => {
      const res = await callAPI<{ data: Contact[]; total: number }>(
        `/crm-contacts?${queryParams.toString()}`,
        { method: "GET" }
      );
      return res;
    },
    enabled: queryEnabled && Boolean(tenant_id),
  });
}

export function useContact(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId],
    queryFn: async () => {
      const data = await callAPI<Contact>(
        `/crm-contacts/${contactId}`,
        { method: "GET" }
      );
      return data;
    },
    enabled: !!contactId,
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
  chatwoot_conversation_id?: number | null;
  chatwoot_account_id?: string | number | null;
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

export function useMergeDuplicateContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId?: string | null) => {
      const res = await callAPI<{ success: boolean; deleted: number; merged_groups: number }>(
        "/crm-contacts/merge-duplicates",
        { method: "POST", body: tenantId ? { tenant_id: tenantId } : {} }
      );
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}

export interface ImportContactRow {
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf_cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  notes?: string | null;
}

export function useImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenant_id,
      rows,
    }: {
      tenant_id: string;
      rows: ImportContactRow[];
    }) => {
      const res = await callAPI<{
        success: boolean;
        imported: number;
        total_rows: number;
      }>("/crm-contacts/import", {
        method: "POST",
        body: { tenant_id, rows },
      });
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });
}

// --- Faturas ---
export function useContactInvoices(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "invoices"],
    queryFn: async () => {
      const res = await callAPI<{ data: ContactInvoice[] }>(
        `/crm-contacts/${contactId}/invoices`,
        { method: "GET" }
      );
      return res.data;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactInvoice(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      amount: number;
      due_date: string;
      description?: string;
      status?: string;
      paid_at?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const data = await callAPI<ContactInvoice>(`/crm-contacts/${contactId}/invoices`, {
        method: "POST",
        body: item,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "invoices"] }),
  });
}

export function useUpdateContactInvoice(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      ...updates
    }: Partial<ContactInvoice> & { invoiceId: string }) => {
      const data = await callAPI<ContactInvoice>(
        `/crm-contacts/${contactId}/invoices/${invoiceId}`,
        { method: "PATCH", body: updates }
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "invoices"] }),
  });
}

export function useDeleteContactInvoice(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      await callAPI(`/crm-contacts/${contactId}/invoices/${invoiceId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "invoices"] }),
  });
}

// --- Resumo ---
export function useContactSummary(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "summary"],
    queryFn: async () => {
      const res = await callAPI<ContactSummary>(`/crm-contacts/${contactId}/summary`, { method: "GET" });
      return res;
    },
    enabled: !!contactId,
  });
}

// --- Pacotes / Serviços ---
export function useContactPackages(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "packages"],
    queryFn: async () => {
      const res = await callAPI<{ data: ContactPackage[] }>(`/crm-contacts/${contactId}/packages`, { method: "GET" });
      return res.data;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactPackage(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Omit<Partial<ContactPackage>, "id" | "contact_id" | "tenant_id" | "created_at" | "updated_at">) => {
      const data = await callAPI<ContactPackage>(`/crm-contacts/${contactId}/packages`, { method: "POST", body: item });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "packages"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

export function useUpdateContactPackage(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ packageId, ...updates }: Partial<ContactPackage> & { packageId: string }) => {
      const data = await callAPI<ContactPackage>(`/crm-contacts/${contactId}/packages/${packageId}`, { method: "PATCH", body: updates });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "packages"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

export function useDeleteContactPackage(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (packageId: string) => {
      await callAPI(`/crm-contacts/${contactId}/packages/${packageId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "packages"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

// --- Agendamentos (vínculo com calendar_events) ---
export function useContactAppointments(contactId: string | null, upcoming?: boolean) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "appointments", upcoming],
    queryFn: async () => {
      const qs = upcoming ? "?upcoming=true" : "";
      const res = await callAPI<{ data: CalendarEvent[] }>(`/crm-contacts/${contactId}/appointments${qs}`, { method: "GET" });
      return res.data;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactAppointment(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { title: string; start_at: string; end_at?: string | null; all_day?: boolean; color?: string; description?: string | null; calendar_id: string }) => {
      const data = await callAPI<CalendarEvent>(`/crm-contacts/${contactId}/appointments`, { method: "POST", body: item });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "appointments"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

export function useUnlinkContactAppointment(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      await callAPI(`/crm-contacts/${contactId}/appointments/${eventId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "appointments"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

export function useUpdateContactAppointment(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, ...updates }: Partial<import("@/types/calendar").CalendarEvent> & { eventId: string }) => {
      const { id: _id, ...body } = updates as Partial<import("@/types/calendar").CalendarEvent> & { id?: string };
      return callAPI<import("@/types/calendar").CalendarEvent>(
        `/crm-contacts/${contactId}/appointments/${eventId}`,
        { method: "PATCH", body },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "appointments"] });
      qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "summary"] });
    },
  });
}

export function useContactCalendars(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "calendars"],
    queryFn: async () => {
      const res = await callAPI<{ data: import("@/types/calendar").Calendar[] }>(
        `/crm-contacts/${contactId}/calendars`,
        { method: "GET" },
      );
      return res.data;
    },
    enabled: !!contactId,
  });
}

// --- Documentos ---
export function useContactDocuments(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "documents"],
    queryFn: async () => {
      const res = await callAPI<{ data: ContactDocument[] }>(
        `/crm-contacts/${contactId}/documents`,
        { method: "GET" }
      );
      return res.data;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactDocument(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      name: string;
      file_url: string;
      category?: string;
      file_type?: string | null;
      file_size?: number | null;
      notes?: string | null;
    }) => {
      return callAPI<ContactDocument>(`/crm-contacts/${contactId}/documents`, {
        method: "POST",
        body: item,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "documents"] }),
  });
}

export function useUpdateContactDocument(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, ...updates }: Partial<ContactDocument> & { documentId: string }) => {
      return callAPI<ContactDocument>(`/crm-contacts/${contactId}/documents/${documentId}`, {
        method: "PATCH",
        body: updates,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "documents"] }),
  });
}

export function useDeleteContactDocument(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      await callAPI(`/crm-contacts/${contactId}/documents/${documentId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "documents"] }),
  });
}

// --- Contratos ---
export function useContactContracts(contactId: string | null) {
  return useQuery({
    queryKey: ["crm-contacts", contactId, "contracts"],
    queryFn: async () => {
      const res = await callAPI<{ data: ContactContract[] }>(
        `/crm-contacts/${contactId}/contracts`,
        { method: "GET" }
      );
      return res.data;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactContract(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<ContactContract>) => {
      return callAPI<ContactContract>(`/crm-contacts/${contactId}/contracts`, {
        method: "POST",
        body: item,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "contracts"] }),
  });
}

export function useUpdateContactContract(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, ...updates }: Partial<ContactContract> & { contractId: string }) => {
      return callAPI<ContactContract>(`/crm-contacts/${contactId}/contracts/${contractId}`, {
        method: "PATCH",
        body: updates,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "contracts"] }),
  });
}

export function useDeleteContactContract(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      await callAPI(`/crm-contacts/${contactId}/contracts/${contractId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "contracts"] }),
  });
}

export function useContractTemplates(tenantId: string | null) {
  return useQuery({
    queryKey: ["contract-templates", tenantId],
    queryFn: async () => {
      const res = await callAPI<{ data: any[] }>(`/contract-templates?tenant_id=${tenantId}`, {
        method: "GET",
      });
      return res.data;
    },
    enabled: !!tenantId,
  });
}

export function useCreateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { tenant_id: string; title: string; description?: string; content: string }) => {
      return callAPI<any>("/contract-templates", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ["contract-templates", variables.tenant_id] }),
  });
}

export function useUpdateContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenant_id, ...updates }: { id: string; tenant_id: string; title?: string; description?: string; content?: string }) => {
      return callAPI<any>(`/contract-templates/${id}`, {
        method: "PATCH",
        body: updates,
      });
    },
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ["contract-templates", variables.tenant_id] }),
  });
}

export function useDeleteContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenant_id }: { id: string; tenant_id: string }) => {
      await callAPI(`/contract-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ["contract-templates", variables.tenant_id] }),
  });
}

export function useGenerateContactContract(contactId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { template_id: string }) => {
      return callAPI<ContactContract>(`/crm-contacts/${contactId}/contracts/generate`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "contracts"] }),
  });
}
