import type { SupabaseClient } from "@supabase/supabase-js";

export async function isTenantModuleEnabled(
  supabase: SupabaseClient,
  tenantId: string,
  moduleKey: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("tenant_modules")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  // Fallback seguro durante rollout: sem configuração explícita, módulo segue habilitado.
  if (!data) {
    return true;
  }
  return data.enabled !== false;
}
