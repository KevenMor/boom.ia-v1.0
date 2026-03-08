/**
 * Lista as tools de um agente para verificação no banco.
 * Uso: npx tsx list-agent-tools.ts [agent_name]
 * Exemplo: npx tsx list-agent-tools.ts "Ana Júlia"
 *
 * Execute de dentro da pasta server.
 */

import "dotenv/config";

const NEXUS_URL = process.env.NEXUS_DB_URL ?? "https://boomsolution-supabase.kgn6uc.easypanel.host";
const NEXUS_KEY = process.env.NEXUS_SERVICE_ROLE_KEY ?? process.env.NEXUS_DB_ANON_KEY ?? "";

async function main() {
  const agentName = process.argv[2] || "Ana";

  if (!NEXUS_KEY) {
    console.error("NEXUS_SERVICE_ROLE_KEY ou NEXUS_DB_ANON_KEY não configurado");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(NEXUS_URL, NEXUS_KEY);

  const { data: allTenants } = await supabase.from("tenants").select("id, slug");
  const tenant = (allTenants || []).find((t: any) => /ppl-motor/.test((t.slug || "")));
  let agents: { id: string; name: string }[] | null;
  if (tenant?.id) {
    const r = await supabase.from("agents").select("id, name").eq("tenant_id", tenant.id).limit(5);
    agents = r.data;
  } else {
    const r = await supabase.from("agents").select("id, name").ilike("name", "%Ana%").limit(5);
    agents = r.data;
  }

  if (!agents?.length) {
    console.log("Nenhum agente encontrado com nome:", agentName);
    process.exit(1);
  }

  for (const agent of agents) {
    console.log("\n=== Agente:", agent.name, "| ID:", agent.id, "===\n");

    const { data: tools } = await supabase.rpc("load_agent_tools", {
      p_agent_id: agent.id,
    });

    if (!tools?.length) {
      console.log("  (sem tools)");
      continue;
    }

    for (let i = 0; i < (tools as any[]).length; i++) {
      const t = (tools as any[])[i];
      const fnName = t.function_def?.name ?? "(sem name)";
      const fnDesc = (t.function_def?.description ?? t.description ?? "").slice(0, 60);
      console.log(`  [${i}] ${t.name}`);
      console.log(`      function_def.name: "${fnName}"`);
      console.log(`      description: ${fnDesc}...`);
      console.log("");
    }
  }
}

main().catch(console.error);
