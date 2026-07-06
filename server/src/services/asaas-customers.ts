import { createNexusClient } from "./supabase.js";
import { asaasRequest } from "./asaas-client.js";

interface ContactRow {
  id: string;
  tenant_id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  cpf_cnpj: string | null;
  asaas_customer_id: string | null;
  asaas_synced_at: string | null;
}

interface AsaasCustomerResponse {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  cpfCnpj?: string | null;
}

export interface EnsureCustomerResult {
  asaasCustomerId: string;
  created: boolean;
}

export async function ensureAsaasCustomer(contactId: string): Promise<EnsureCustomerResult> {
  const supabase = createNexusClient();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, tenant_id, name, full_name, email, phone, mobile_phone, cpf_cnpj, asaas_customer_id, asaas_synced_at")
    .eq("id", contactId)
    .maybeSingle<ContactRow>();
  if (error || !contact) {
    throw new Error(`Contato ${contactId} não encontrado`);
  }

  if (contact.asaas_customer_id) {
    return { asaasCustomerId: contact.asaas_customer_id, created: false };
  }

  const name = contact.name || contact.full_name || "Cliente";
  const cpfCnpj = (contact.cpf_cnpj || "").replace(/\D/g, "");
  const phone = (contact.mobile_phone || contact.phone || "").replace(/\D/g, "");

  if (!cpfCnpj) {
    throw new Error(`Contato sem CPF/CNPJ cadastrado — necessário para o Asaas. Atualize o cadastro do cliente.`);
  }

  const payload: Record<string, unknown> = {
    name,
    cpfCnpj,
    email: contact.email || undefined,
    mobilePhone: phone || undefined,
    notificationDisabled: true,
  };

  const res = await asaasRequest<AsaasCustomerResponse>({
    tenantId: contact.tenant_id,
    path: "/customers",
    method: "POST",
    body: payload,
  });

  if (!res.ok || !res.data?.id) {
    const msg = !res.ok ? res.error : "Asaas não retornou id do customer";
    throw new Error(`Asaas recusou criar customer: ${msg}`);
  }

  const customerId = res.data.id;

  await supabase
    .from("contacts")
    .update({
      asaas_customer_id: customerId,
      asaas_synced_at: new Date().toISOString(),
    })
    .eq("id", contactId);

  return { asaasCustomerId: customerId, created: true };
}

export async function getAsaasCustomerId(contactId: string): Promise<string | null> {
  const supabase = createNexusClient();
  const { data } = await supabase
    .from("contacts")
    .select("asaas_customer_id")
    .eq("id", contactId)
    .maybeSingle<{ asaas_customer_id: string | null }>();
  return data?.asaas_customer_id ?? null;
}