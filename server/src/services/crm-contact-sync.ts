import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_PHONE_DIGITS = 10;

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return "";
  if (!digits.startsWith("55") && digits.length <= 11) {
    return "55" + digits;
  }
  return digits;
}

/**
 * Insere ou atualiza contato no CRM quando recebe mensagem via webhook/Chat ao Vivo.
 * Usa (tenant_id, phone) como chave; atualiza nome e avatar_url se vierem dados novos.
 */
export async function upsertCrmContact(
  supabase: SupabaseClient,
  tenantId: string,
  externalUserId: string,
  contactName: string | null,
  avatarUrl?: string | null
): Promise<void> {
  const phone = normalizePhone(externalUserId);
  if (!phone) return;

  const name = (contactName || "").trim() || phone;

  try {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, name, avatar_url")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (contactName && contactName.trim() && existing.name !== contactName.trim()) {
        updates.name = contactName.trim();
      }
      if (avatarUrl != null && avatarUrl !== existing.avatar_url) {
        updates.avatar_url = avatarUrl || null;
      }
      if (Object.keys(updates).length > 1) {
        await supabase.from("contacts").update(updates).eq("id", existing.id);
      }
      return;
    }

    await supabase.from("contacts").insert({
      tenant_id: tenantId,
      name,
      phone,
      email: null,
      cpf_cnpj: null,
      address: null,
      city: null,
      state: null,
      zip_code: null,
      notes: null,
      avatar_url: avatarUrl || null,
    });
  } catch (e) {
    console.warn("[CRM] upsertCrmContact failed:", (e as Error)?.message ?? e);
  }
}
