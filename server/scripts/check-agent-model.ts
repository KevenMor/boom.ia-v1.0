/**
 * Consulta modelo e provider do agente Ana Júlia (PPL Motors).
 * Uso: npx tsx scripts/check-agent-model.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const NEXUS_URL = process.env.NEXUS_DB_URL;
const NEXUS_KEY = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

async function main() {
  if (!NEXUS_URL || !NEXUS_KEY) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }

  const supabase = createClient(NEXUS_URL, NEXUS_KEY);

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug, name, settings");
  const tenant = (tenants || []).find((t: { slug?: string }) =>
    ["ppl-motors", "ppl-mortors"].includes((t.slug || "").toLowerCase())
  ) as { id: string; slug?: string; name?: string; settings?: unknown } | undefined;

  if (!tenant) {
    console.log("Tenant PPL Motors não encontrado.");
    const { data: all } = await supabase.from("tenants").select("id, slug, name");
    console.log("Tenants:", JSON.stringify(all, null, 2));
    return;
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, model, provider_id, config")
    .eq("tenant_id", tenant.id);

  const agent = agents?.[0];
  if (!agent) {
    console.log("Nenhum agente no tenant PPL Motors.");
    return;
  }

  const tenantSettings = (tenant.settings || {}) as Record<string, unknown>;
  const agentConfig = (agent.config || {}) as Record<string, unknown>;

  const dispatcherProviderId = agentConfig.dispatcher_provider_id ?? tenantSettings.dispatcher_provider_id;
  const dispatcherModel = agentConfig.dispatcher_model ?? tenantSettings.dispatcher_model ?? "(padrão: gpt-4o-mini)";

  // Buscar nome do provider principal
  let providerName = "?";
  if (agent.provider_id) {
    const { data: prov } = await supabase.from("providers").select("name, base_url").eq("id", agent.provider_id).single();
    providerName = prov?.name || agent.provider_id;
  }

  let dispatcherProviderName = "?";
  if (dispatcherProviderId) {
    const { data: dp } = await supabase.from("providers").select("name, base_url").eq("id", dispatcherProviderId).single();
    dispatcherProviderName = dp?.name || dispatcherProviderId;
  }

  console.log("\n=== Ana Júlia (PPL Motors) — Configuração de modelos ===\n");
  console.log("Agente:", agent.name, "| ID:", agent.id);
  console.log("");
  console.log("Conversacional (resposta ao cliente):");
  console.log("  - Modelo:", agent.model || "(padrão: gpt-4o-mini)");
  console.log("  - Provider:", providerName);
  console.log("");
  console.log("Dispatcher (decisão de tools):");
  console.log("  - Usa dual-provider:", !!dispatcherProviderId);
  console.log("  - Dispatcher provider:", dispatcherProviderName);
  console.log("  - Dispatcher modelo:", dispatcherModel);
  console.log("");
}

main().catch(console.error);
