import type { createNexusClient } from "./supabase.js";

type Nexus = ReturnType<typeof createNexusClient>;

/** false = tenant pediu IA globalmente desligada. Default / null row = ligada. */
export async function isTenantAiGloballyDisabled(supabase: Nexus, tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  const { data, error } = await supabase.from("tenants").select("ai_globally_enabled").eq("id", tenantId).maybeSingle();
  if (error || !data) return false;
  return data.ai_globally_enabled === false;
}
