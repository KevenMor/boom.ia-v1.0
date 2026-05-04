import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15; // Telefone BR com 55 + DDD + número; > 15 = ID interno (grupo, Chatwoot)

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return "";
  if (digits.length > MAX_PHONE_DIGITS) return ""; // ID de grupo/Chatwoot, não é telefone
  if (!digits.startsWith("55") && digits.length <= 11) {
    return "55" + digits;
  }
  return digits;
}

/**
 * Insere ou atualiza contato no CRM quando recebe mensagem via webhook/Chat ao Vivo.
 * Usa (tenant_id, phone) como chave para telefones reais; para contatos de grupo (ID longo),
 * usa (tenant_id, name) para evitar duplicatas do mesmo nome.
 */
export async function upsertCrmContact(
  supabase: SupabaseClient,
  tenantId: string,
  externalUserId: string,
  contactName: string | null,
  avatarUrl?: string | null
): Promise<void> {
  const phone = normalizePhone(externalUserId);
  const name = (contactName || "").trim() || null;

  // Contato de grupo: externalUserId é ID longo (não telefone) — deduplica por nome
  if (!phone && name) {
    try {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, name, avatar_url")
        .eq("tenant_id", tenantId)
        .eq("name", name)
        .is("phone", null)
        .maybeSingle();

      if (existing) {
        if (avatarUrl != null && avatarUrl !== existing.avatar_url) {
          await supabase.from("contacts").update({ avatar_url: avatarUrl || null, updated_at: new Date().toISOString() }).eq("id", existing.id);
        }
        return;
      }
      // Evita criar duplicata se já existe contato com mesmo nome (qualquer phone)
      const { data: byName } = await supabase
        .from("contacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (byName) return; // Já existe, não duplicar
      await supabase.from("contacts").insert({
        tenant_id: tenantId,
        name,
        phone: null,
        email: null,
        cpf_cnpj: null,
        address: null,
        city: null,
        state: null,
        zip_code: null,
        notes: null,
        avatar_url: avatarUrl || null,
        contact_type: "lead",
      });
    } catch (e) {
      console.warn("[CRM] upsertCrmContact (group) failed:", (e as Error)?.message ?? e);
    }
    return;
  }

  if (!phone) return;

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
      name: name || phone,
      phone,
      email: null,
      cpf_cnpj: null,
      address: null,
      city: null,
      state: null,
      zip_code: null,
      notes: null,
      avatar_url: avatarUrl || null,
      contact_type: "lead",
    });
  } catch (e) {
    console.warn("[CRM] upsertCrmContact failed:", (e as Error)?.message ?? e);
  }
}
