import { createNexusClient } from "./supabase.js";
import { asaasRequest } from "./asaas-client.js";
import { ensureAsaasCustomer } from "./asaas-customers.js";

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

interface InvoiceRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  amount: number;
  due_date: string;
  status: string;
  description: string | null;
  asaas_charge_id: string | null;
}

interface AsaasChargeResponse {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  chargeUrl?: string | null;
  pixQrCodeUrl?: string | null;
  pixCode?: string | null;
}

const ASAAS_TO_LOCAL_STATUS: Record<string, string> = {
  PENDING: "pending",
  RECEIVED: "paid",
  CONFIRMED: "paid",
  OVERDUE: "overdue",
  REFUNDED: "cancelled",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
};

function pickBillingType(invoice: InvoiceRow): BillingType {
  const desc = (invoice.description || "").toLowerCase();
  if (desc.includes("boleto")) return "BOLETO";
  if (desc.includes("pix")) return "PIX";
  return "PIX";
}

export async function createChargeFromInvoice(invoiceId: string, tenantId: string): Promise<void> {
  const supabase = createNexusClient();
  const { data: invoice, error } = await supabase
    .from("contact_invoices")
    .select("id, tenant_id, contact_id, amount, due_date, status, description, asaas_charge_id")
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();
  if (error || !invoice) {
    throw new Error(`Fatura ${invoiceId} não encontrada`);
  }
  if (invoice.tenant_id !== tenantId) {
    throw new Error("Tenant da fatura não confere");
  }
  if (invoice.asaas_charge_id) {
    return; // já sincronizada
  }

  const customer = await ensureAsaasCustomer(invoice.contact_id);

  const dueDate = invoice.due_date;
  const payload = {
    customer: customer.asaasCustomerId,
    billingType: pickBillingType(invoice),
    value: Number(invoice.amount),
    dueDate,
    description: (invoice.description || `Fatura #${invoice.id.slice(0, 8)}`).slice(0, 500),
    externalReference: invoice.id,
  };

  const res = await asaasRequest<AsaasChargeResponse>({
    tenantId,
    path: "/charges",
    method: "POST",
    body: payload,
  });

  if (!res.ok || !res.data?.id) {
    const errorMsg = !res.ok ? res.error : "Asaas não retornou id da cobrança";
    await supabase
      .from("contact_invoices")
      .update({
        asaas_status: "ERROR",
        asaas_last_error: errorMsg,
        asaas_synced_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    throw new Error(`Asaas recusou criar cobrança: ${errorMsg}`);
  }

  let pixQrCode: string | null = null;
  let pixPayload: string | null = null;

  if (pickBillingType(invoice) === "PIX") {
    const pixRes = await asaasRequest<{ encodedImage?: string; payload?: string }>({
      tenantId,
      path: `/payments/${res.data.id}/pixQrCode`,
    });
    if (pixRes.ok && pixRes.data) {
      pixQrCode = pixRes.data.encodedImage ?? null;
      pixPayload = pixRes.data.payload ?? null;
    }
  }

  await supabase
    .from("contact_invoices")
    .update({
      asaas_charge_id: res.data.id,
      asaas_charge_url: res.data.invoiceUrl ?? res.data.bankSlipUrl ?? null,
      asaas_invoice_url: res.data.invoiceUrl ?? null,
      asaas_bank_slip_url: res.data.bankSlipUrl ?? null,
      asaas_pix_qrcode: pixQrCode,
      asaas_pix_payload: pixPayload,
      asaas_billing_type: pickBillingType(invoice),
      asaas_status: "PENDING",
      asaas_synced_at: new Date().toISOString(),
      asaas_last_error: null,
    })
    .eq("id", invoiceId);
}

export async function syncChargeFromAsaas(invoiceId: string, tenantId: string): Promise<void> {
  const supabase = createNexusClient();
  const { data: invoice } = await supabase
    .from("contact_invoices")
    .select("id, asaas_charge_id, asaas_status")
    .eq("id", invoiceId)
    .maybeSingle<{ id: string; asaas_charge_id: string | null; asaas_status: string | null }>();
  if (!invoice?.asaas_charge_id) return;

  const res = await asaasRequest<AsaasChargeResponse>({
    tenantId,
    path: `/charges/${invoice.asaas_charge_id}`,
  });

  if (!res.ok) {
    await supabase
      .from("contact_invoices")
      .update({
        asaas_last_error: res.error,
        asaas_synced_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    return;
  }

  const localStatus = ASAAS_TO_LOCAL_STATUS[res.data.status] ?? invoice.asaas_status;
  const update: Record<string, unknown> = {
    asaas_status: res.data.status,
    asaas_invoice_url: res.data.invoiceUrl ?? null,
    asaas_bank_slip_url: res.data.bankSlipUrl ?? null,
    asaas_synced_at: new Date().toISOString(),
    asaas_last_error: null,
  };

  if (localStatus === "paid") {
    update.status = "paid";
    update.paid_at = new Date().toISOString();
  } else if (localStatus && localStatus !== invoice.asaas_status) {
    update.status = localStatus;
  }

  await supabase.from("contact_invoices").update(update).eq("id", invoiceId);
}

export async function syncChargeByChargeId(chargeId: string): Promise<void> {
  const supabase = createNexusClient();
  const { data: invoice } = await supabase
    .from("contact_invoices")
    .select("id, tenant_id")
    .eq("asaas_charge_id", chargeId)
    .maybeSingle<{ id: string; tenant_id: string }>();
  if (!invoice) return;
  await syncChargeFromAsaas(invoice.id, invoice.tenant_id);
}