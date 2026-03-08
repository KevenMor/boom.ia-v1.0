/**
 * Verifica se algum agente tem tools não implementadas (chatwoot_assign, send_notification).
 * Uso: npx tsx scripts/verify-agent-tools.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const UNIMPLEMENTED_TOOLS = ["chatwoot_assign", "send_notification"];

async function main() {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY (ou NEXUS_DB_ANON_KEY) são obrigatórios.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: tools, error } = await supabase
    .from("tools")
    .select("id, name, tool_type, tenant_id");

  if (error) {
    console.error("Erro ao buscar tools:", error.message);
    process.exit(1);
  }

  const unimplemented = (tools || []).filter((t) =>
    UNIMPLEMENTED_TOOLS.includes(t.tool_type || "")
  );

  const { data: agentTools } = await supabase
    .from("agent_tools")
    .select("agent_id, tool_id")
    .in("tool_id", unimplemented.map((u) => u.id));

  const agentIds = [...new Set((agentTools || []).map((at) => at.agent_id))];

  if (agentIds.length > 0) {
    console.log("\n⚠️ Agentes com tools NÃO implementadas:");
    const { data: agents } = await supabase
      .from("agents")
      .select("id, name, tenant_id")
      .in("id", agentIds);
    for (const a of agents || []) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", a.tenant_id)
        .single();
      console.log(`  - ${a.name} (tenant: ${tenant?.slug || a.tenant_id})`);
    }
    process.exit(1);
  }

  if (unimplemented.length > 0) {
    console.log("✓ Nenhum agente vinculado a tools não implementadas (chatwoot_assign, send_notification).");
  } else {
    console.log("✓ Nenhuma tool não implementada no banco.");
  }
}

main();
