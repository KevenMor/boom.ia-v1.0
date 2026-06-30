import type { SupabaseClient } from "@supabase/supabase-js";
import { matchesChatwootAccount } from "./chatwoot-agent-mirror.js";
import {
  crmPhoneMatches,
  formatPhoneForStorage,
  isValidCrmPhone,
  normalizeBrazilPhoneDigits,
  phoneSearchSuffix,
} from "../utils/crm-phone-match.js";

export type CrmLookupState = "missing" | "lead" | "client";

export interface CrmEmbedContact {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  metadata: unknown;
  avatar_url: string | null;
  contact_type: "lead" | "client";
  created_at: string;
  updated_at: string;
  tenants?: { name: string } | null;
}

const CONTACT_SELECT =
  "id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, contact_type, created_at, updated_at, tenants(name)";

export async function resolveTenantFromChatwootAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ tenantId: string; agentId: string } | null> {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, tenant_id, config")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const matched = (agents ?? []).find((row) =>
    matchesChatwootAccount((row as { config?: Record<string, unknown> }).config, accountId),
  );

  if (!matched) return null;
  return {
    tenantId: (matched as { tenant_id: string }).tenant_id,
    agentId: (matched as { id: string }).id,
  };
}

export async function findContactByPhone(
  supabase: SupabaseClient,
  tenantId: string,
  phoneDigits: string,
): Promise<CrmEmbedContact | null> {
  if (!isValidCrmPhone(phoneDigits)) return null;

  const suffix = phoneSearchSuffix(phoneDigits);
  if (!suffix) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("tenant_id", tenantId)
    .or(`phone.ilike.%${suffix}%`)
    .limit(50);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as CrmEmbedContact[];
  return rows.find((c) => crmPhoneMatches(phoneDigits, c.phone)) ?? null;
}

export function lookupState(contact: CrmEmbedContact | null): CrmLookupState {
  if (!contact) return "missing";
  return contact.contact_type === "client" ? "client" : "lead";
}

export interface PromoteInput {
  tenantId: string;
  phoneDigits: string;
  name?: string | null;
  email?: string | null;
}

export async function promoteOrCreateClient(
  supabase: SupabaseClient,
  input: PromoteInput,
): Promise<CrmEmbedContact> {
  const { tenantId, phoneDigits, name, email } = input;
  if (!isValidCrmPhone(phoneDigits)) {
    throw new Error("Telefone inválido para CRM");
  }

  const existing = await findContactByPhone(supabase, tenantId, phoneDigits);
  if (existing?.contact_type === "client") return existing;

  const now = new Date().toISOString();
  const phoneStored = formatPhoneForStorage(phoneDigits);

  if (existing) {
    const { data, error } = await supabase
      .from("contacts")
      .update({
        contact_type: "client",
        name: name?.trim() || existing.name,
        email: email?.trim() || existing.email,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select(CONTACT_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as unknown as CrmEmbedContact;
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      tenant_id: tenantId,
      name: (name?.trim() || "Cliente").slice(0, 200),
      email: email?.trim() || null,
      phone: phoneStored,
      contact_type: "client",
      metadata: JSON.stringify({}),
    })
    .select(CONTACT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as CrmEmbedContact;
}

export async function assertContactBelongsToTenant(
  supabase: SupabaseClient,
  contactId: string,
  tenantId: string,
): Promise<CrmEmbedContact> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", contactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contato não encontrado");
  if (data.tenant_id !== tenantId) throw new Error("Contato não pertence a este tenant");
  return data as unknown as CrmEmbedContact;
}

export async function getContactSummary(
  supabase: SupabaseClient,
  contactId: string,
): Promise<{
  total_invoiced: number;
  total_paid: number;
  total_overdue: number;
  invoice_count: number;
  active_packages: number;
  upcoming_appointments: number;
}> {
  const now = new Date().toISOString();
  const [invoicesRes, packagesRes, appointmentsRes] = await Promise.all([
    supabase.from("contact_invoices").select("amount, status").eq("contact_id", contactId),
    supabase.from("contact_packages").select("id").eq("contact_id", contactId).eq("status", "active"),
    supabase.from("calendar_events").select("id").eq("contact_id", contactId).gte("start_at", now),
  ]);

  const invoices = (invoicesRes.data ?? []) as Array<{ amount: number; status: string }>;
  const total_invoiced = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const total_paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const total_overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0);

  return {
    total_invoiced,
    total_paid,
    total_overdue,
    invoice_count: invoices.length,
    active_packages: (packagesRes.data ?? []).length,
    upcoming_appointments: (appointmentsRes.data ?? []).length,
  };
}

export function normalizePhoneFromChatwoot(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!isValidCrmPhone(digits)) return null;
  return normalizeBrazilPhoneDigits(digits);
}
