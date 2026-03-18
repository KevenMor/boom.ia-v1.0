/**
 * Testa as chamadas à API Chatwoot para etiquetagem de leads.
 * Uso: npx tsx scripts/test-lead-label.ts <agent_id> <chatwoot_conversation_id>
 *
 * Exemplo: npx tsx scripts/test-lead-label.ts 82c50d30-0034-43f4-b7e7-f1c125db44e2 123
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { addLeadLabelToConversation } from "../src/services/chatwoot-labels.js";

async function main() {
  const agentId = process.argv[2];
  const chatwootConvIdStr = process.argv[3];

  if (!agentId || !chatwootConvIdStr) {
    console.error("Uso: npx tsx scripts/test-lead-label.ts <agent_id> <chatwoot_conversation_id>");
    console.error("Exemplo: npx tsx scripts/test-lead-label.ts 82c50d30-0034-43f4-b7e7-f1c125db44e2 123");
    process.exit(1);
  }

  const chatwootConvId = parseInt(chatwootConvIdStr, 10);
  if (Number.isNaN(chatwootConvId)) {
    console.error("chatwoot_conversation_id deve ser um número");
    process.exit(1);
  }

  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY (ou NEXUS_DB_ANON_KEY) são obrigatórios.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .select("id, name, config")
    .eq("id", agentId)
    .single();

  if (agentErr || !agent) {
    console.error("Agente não encontrado:", agentErr?.message || "ID inválido");
    process.exit(1);
  }

  const cfg = (agent.config || {}) as Record<string, unknown>;
  const cwUrl = cfg.chatwoot_url as string | undefined;
  const cwToken = cfg.chatwoot_api_token as string | undefined;
  const cwAccountId = cfg.chatwoot_account_id as string | number | undefined;
  const leadEnabled = !!cfg.lead_label_enabled;

  console.log("\n--- Configuração do agente ---");
  console.log("Agente:", agent.name, "(" + agentId + ")");
  console.log("lead_label_enabled:", leadEnabled);
  console.log("chatwoot_url:", cwUrl ? cwUrl.replace(/\/\/[^@]+@/, "//***@") : "(não configurado)");
  console.log("chatwoot_account_id:", cwAccountId);
  console.log("chatwoot_api_token:", cwToken ? "***" : "(não configurado)");
  console.log("chatwoot_conversation_id:", chatwootConvId);
  console.log("");

  if (!cwUrl || !cwToken || !cwAccountId) {
    console.error("Chatwoot não configurado neste agente.");
    process.exit(1);
  }

  const config = {
    chatwoot_url: cwUrl,
    chatwoot_api_token: cwToken,
    chatwoot_account_id: cwAccountId,
  };

  try {
    console.log("Chamando addLeadLabelToConversation...");
    const labelTitle = await addLeadLabelToConversation(config, chatwootConvId);
    console.log("✓ Sucesso! Etiqueta aplicada:", labelTitle);
  } catch (e) {
    console.error("✗ Erro:", (e as Error).message);
    process.exit(1);
  }
}

main();
