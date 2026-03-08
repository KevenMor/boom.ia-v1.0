/**
 * Verifica se o rastreamento de tokens está funcionando (tabela existe e tem dados).
 * Uso: npx tsx scripts/verify-token-tracking.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("agent_token_usage")
    .select("id, agent_id, prompt_tokens, completion_tokens, total_tokens, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      console.log("⚠️ Tabela agent_token_usage não existe. Execute a migration:");
      console.log("   npm run migrate:tokens");
      console.log("   Ou execute o SQL manualmente no Supabase SQL Editor.");
      process.exit(1);
    }
    console.error("Erro:", error.message);
    process.exit(1);
  }

  if (!data?.length) {
    console.log("✓ Tabela agent_token_usage existe, mas ainda não há registros.");
    console.log("  Faça uma chamada ao chat para gerar dados.");
    return;
  }

  console.log(`✓ Rastreamento de tokens OK. Últimos ${data.length} registros:`);
  for (const row of data) {
    console.log(`  - ${row.agent_id} | in: ${row.prompt_tokens} out: ${row.completion_tokens} total: ${row.total_tokens} | ${row.created_at}`);
  }
}

main();
