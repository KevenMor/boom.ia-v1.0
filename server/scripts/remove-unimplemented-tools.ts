/**
 * Remove tools não implementadas (chatwoot_assign, send_notification) dos agentes.
 * Uso: npx tsx scripts/remove-unimplemented-tools.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const UNIMPLEMENTED_TOOLS = ["chatwoot_assign", "send_notification"];

async function main() {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: tools } = await supabase
    .from("tools")
    .select("id, name, tool_type")
    .in("tool_type", UNIMPLEMENTED_TOOLS);

  if (!tools?.length) {
    console.log("Nenhuma tool não implementada encontrada.");
    return;
  }

  const toolIds = tools.map((t) => t.id);
  const { data: links, error: linksErr } = await supabase
    .from("agent_tools")
    .select("agent_id, tool_id")
    .in("tool_id", toolIds);

  if (linksErr || !links?.length) {
    console.log("Nenhum agente vinculado a essas tools.");
    return;
  }

  const { error: delErr } = await supabase
    .from("agent_tools")
    .delete()
    .in("tool_id", toolIds);

  if (delErr) {
    console.error("Erro ao remover vínculos:", delErr.message);
    process.exit(1);
  }

  console.log(`Removidos ${links.length} vínculos de tools não implementadas dos agentes.`);
  for (const t of tools) {
    console.log(`  - ${t.name} (${t.tool_type})`);
  }
}

main();
