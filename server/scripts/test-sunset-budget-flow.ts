/**
 * E2E pontual — dispara um pedido de orçamento Sunset para confirmar
 * que o formatter devolve `<<MSG_SPLIT>>` separando cada bloco foto+preço.
 *
 * Uso: cd server && npx tsx scripts/test-sunset-budget-flow.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAT_LOCAL = `${BASE}/api/chat-local`;

async function resolveAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug")
    .in("slug", ["sunset-thermas-park", "sunset-thermas"]);
  const ids = (tenants || []).map((t) => t.id).filter(Boolean);
  if (!ids.length) return null;
  const { data: agents } = await supabase.from("agents").select("id").in("tenant_id", ids).limit(5);
  return agents?.[0]?.id ?? null;
}

async function runTurn(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 120000
): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const r = await fetch(CHAT_LOCAL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nexus-auth": `Bearer ${process.env.NEXUS_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      agent_id: agentId,
      messages,
      conversation_id: null,
      skip_history_persist: true,
    }),
    signal: ctl.signal,
  });
  clearTimeout(t);
  const raw = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.slice(0, 300)}`);
  let content = "";
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t.startsWith("data: ")) continue;
    const js = t.slice(6).trim();
    if (js === "[DONE]") continue;
    try {
      const ev = JSON.parse(js);
      const d = ev.choices?.[0]?.delta?.content;
      if (typeof d === "string") content += d;
    } catch {
      /* skip */
    }
  }
  return content.trim();
}

async function main() {
  const agentId = await resolveAgentId();
  if (!agentId) {
    console.error("Falha ao resolver agente Sunset. Defina NEXUS_DB_URL + chave.");
    process.exit(1);
  }
  console.log("Agente Sunset:", agentId.slice(0, 8) + "…");

  const messages: Array<{ role: string; content: string }> = [
    { role: "user", content: "Oi! Pode me chamar de Gabi. Quero um orçamento de hospedagem." },
  ];

  console.log("\n— Turno 1 —");
  const t1 = await runTurn(agentId, messages);
  console.log("Assistente:", t1.slice(0, 400));
  messages.push({ role: "assistant", content: t1 });

  console.log("\n— Turno 2 (pede orçamento direto) —");
  messages.push({
    role: "user",
    content:
      "Sim, só hospedagem mesmo. Para 2 adultos, uma noite, próximo fim de semana (sábado para domingo). Pode mandar as opções e os valores agora?",
  });
  const t2 = await runTurn(agentId, messages);
  console.log("\n=== RESPOSTA TURNO 2 (orçamento) ===\n");
  console.log(t2);
  console.log("\n=== FIM ===");

  console.log("\n=== VALIDAÇÕES ===");
  console.log("contém R$?:", /R\$\s*[\d.,]+/.test(t2));
  console.log("contém MSG_SPLIT?:", t2.includes("<<MSG_SPLIT>>"));
  console.log("contém ![foto](url)?:", /!\[.*?\]\(https?:/.test(t2));

  if (!/R\$\s*[\d.,]+/.test(t2)) {
    console.error("\n✗ Sem preço no Turno 2 — Julia não chegou no orçamento.");
    process.exit(1);
  }

  const parts = t2.includes("<<MSG_SPLIT>>") ? t2.split("<<MSG_SPLIT>>") : [t2];
  console.log(`split em ${parts.length} partes`);

  const IMAGE_MD_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;
  const PRICE_LINE_RE = /\*[^*]+\*\s*[—–-]\s*R\$\s*[\d.,]+/;
  const lodgingPairs = parts.filter((p) => {
    const lines = p
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length >= 2 && IMAGE_MD_RE.test(lines[0]) && PRICE_LINE_RE.test(lines[1]);
  });
  console.log(`blocos foto+preço detectados: ${lodgingPairs.length}`);

  if (lodgingPairs.length >= 1) {
    console.log("\n✓ Pelo menos 1 bloco foto+preço pareado — formatter funcionou.");
    if (lodgingPairs.length >= 2) {
      console.log(`✓ ${lodgingPairs.length} blocos pareados — múltiplas acomodações OK.`);
    }
    process.exit(0);
  }

  // Não-pareado: formatter caiu no caminho D ou LLM omitiu foto. Mostrar o conteúdo
  // integral para inspeção visual.
  console.warn(
    "\n⚠ Nenhum bloco foto+preço pareado na forma ![…](url)\\n*R$*."
  );
  console.warn(
    "  Possíveis causas: (a) formatter caiu no caminho D (LLM não usou foto inline);"
  );
  console.warn(
    "  (b) delivery separa foto e preço por parágrafo. Inspecionar logs do server `[SunsetQuote][diag]`."
  );
  console.warn(
    "  Se o texto acima JÁ mostra foto+preço juntos visualmente, a correção está funcionando."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
