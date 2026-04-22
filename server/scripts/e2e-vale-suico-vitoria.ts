/**
 * Teste E2E — Agente Vitória (Vale Suíço Resort)
 * Fluxos: abertura acolhedora (sem preço), qualificação antes de Omnibees, orçamento após dados completos.
 *
 * Uso (na pasta server): npx tsx scripts/e2e-vale-suico-vitoria.ts [agent_id]
 * Requer API em execução (ex.: npm run dev:all) e NEXUS_DB_URL + NEXUS_SERVICE_ROLE_KEY no .env.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.API_BASE_URL || "http://localhost:3001";
const CHAT_URL = `${BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/chat`;
const AUTH =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

interface Turn {
  user: string;
  expect?: RegExp | string;
  expectNot?: RegExp | string;
  name: string;
}

async function streamChat(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  conversationId: string | null
): Promise<{ content: string; conversationId: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH}`,
      },
      body: JSON.stringify({
        agent_id: agentId,
        messages,
        conversation_id: conversationId,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text();
      return {
        content: "",
        conversationId: null,
        error: `HTTP ${resp.status}: ${text.slice(0, 400)}`,
      };
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/event-stream")) {
      const data = await resp.json().catch(() => ({}));
      return {
        content: typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "",
        conversationId: data?.conversation_id ?? null,
      };
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let convId: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);

        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              return { content, conversationId: convId, error: String(parsed.error) };
            }
            if (parsed.conversation_id) convId = parsed.conversation_id;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) content += delta;
          } catch {
            /* skip */
          }
        }
      }
      if (done) break;
    }

    return { content, conversationId: convId };
  } catch (e: unknown) {
    clearTimeout(timeout);
    return {
      content: "",
      conversationId: null,
      error: (e as Error).message || String(e),
    };
  }
}

async function getValeSuicoAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug")
    .in("slug", ["vale-suico", "vale-suico-resort"])
    .limit(2);

  const tenant = tenants?.[0];
  if (!tenant) {
    const { data: all } = await supabase.from("tenants").select("id, slug").limit(40);
    console.log("[E2E] Tenants (trecho):", (all || []).map((t: { slug: string }) => t.slug).join(", "));
    return null;
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .limit(3);

  const byName = (agents || []).find((a: { name: string }) => /vit[oó]ria|vale su[ií]co/i.test(a.name || ""));
  return (byName?.id || agents?.[0]?.id) ?? null;
}

function check(content: string, turn: Turn): { ok: boolean; msg: string } {
  if (turn.expect) {
    const re = typeof turn.expect === "string" ? new RegExp(turn.expect, "i") : turn.expect;
    if (!re.test(content)) {
      return { ok: false, msg: `Esperava "${turn.expect}" em: ${content.slice(0, 220)}…` };
    }
  }
  if (turn.expectNot) {
    const re = typeof turn.expectNot === "string" ? new RegExp(turn.expectNot, "i") : turn.expectNot;
    if (re.test(content)) {
      return { ok: false, msg: `Esperava NÃO ter "${turn.expectNot}" em: ${content.slice(0, 220)}…` };
    }
  }
  return { ok: true, msg: "OK" };
}

async function runFlow(agentId: string, flowName: string, turns: Turn[]) {
  console.log(`\n--- Fluxo: ${flowName} ---`);

  let conversationId: string | null = null;
  const messages: Array<{ role: string; content: string }> = [];
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    messages.push({ role: "user", content: turn.user });

    const r = await streamChat(agentId, messages, conversationId);
    if (r.error) {
      console.log(`  [${i + 1}] ✗ ${turn.name}: ${r.error}`);
      failed++;
      break;
    }

    if (r.conversationId) conversationId = r.conversationId;
    messages.push({ role: "assistant", content: r.content });

    const result = check(r.content, turn);
    if (result.ok) {
      console.log(`  [${i + 1}] ✓ ${turn.name}`);
      passed++;
    } else {
      console.log(`  [${i + 1}] ✗ ${turn.name}: ${result.msg}`);
      console.log(`  Resposta: ${r.content.slice(0, 350)}…`);
      failed++;
    }
  }

  return { passed, failed };
}

async function main() {
  if (!AUTH) {
    console.error("Configure VITE_SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY para o header Authorization.");
    process.exit(1);
  }

  let agentId = process.argv[2];
  if (!agentId) {
    agentId = (await getValeSuicoAgentId()) || "";
  }
  if (!agentId) {
    console.error("Uso: npx tsx scripts/e2e-vale-suico-vitoria.ts [agent_id]");
    console.error("Ou configure NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY para resolver o agente do tenant vale-suico.");
    process.exit(1);
  }

  console.log("=== E2E Vale Suíço Resort (Vitória) ===");
  console.log("CHAT_URL:", CHAT_URL);
  console.log("Agent ID:", agentId);

  let totalPassed = 0;
  let totalFailed = 0;

  // 1) Primeira resposta: acolhimento + identidade; sem valores nem link Omnibees
  const r1 = await runFlow(agentId, "Abertura — identidade e pergunta do nome (sem preço)", [
    {
      user: "Olá, boa tarde!",
      name: "Saudação",
      expect: /vit[oó]ria|vale\s+su[ií]co/i,
      expectNot: /R\$\s*\d|book\.omnibees|omnibees\.com\/hotelresults/i,
    },
    {
      user: "Pode me chamar de Marina.",
      name: "Nome informado",
      expect: /marina|prazer|seja|bem-vind|datas|estad|hosped|quando|check/i,
      expectNot: /R\$\s*\d{2,}|book\.omnibees/i,
    },
  ]);
  totalPassed += r1.passed;
  totalFailed += r1.failed;

  // 2) Pedido de preço sem nome — prompt exige apresentar Vitória e perguntar como chamar (sem valores ainda)
  const r2 = await runFlow(agentId, "Orçamento sem ter dito o nome — qualificar antes de valores", [
    {
      user: "Boa noite! Quanto custa uma diária aí no resort?",
      name: "Preço sem nome",
      expect: /vit[oó]ria|vale\s+su[ií]co|chamar|prefere ser chamad|como (prefere|posso te) chamar/i,
      expectNot: /R\$\s*\d{3,}|book\.omnibees|hotelresults/i,
    },
  ]);
  totalPassed += r2.passed;
  totalFailed += r2.failed;

  // 3) Qualificação completa + pedido de orçamento → espera menção a valores ou quartos ou link (Omnibees pode falhar na API)
  const r3 = await runFlow(agentId, "Dados completos — orçamento ou disponibilidade", [
    { user: "Bom dia!", name: "Saudação" },
    { user: "Me chame de Roberto.", name: "Nome" },
    {
      user: "Estamos pensando em 20 a 23 de maio, 2 adultos, sem criança.",
      name: "Datas e ocupação explícita",
      expect: /roberto|maio|20|23|adult|sem crian|perfeito|ótimo|combin|noted|orçament|valor|diária|quarto|pacote|consult|disponib/i,
    },
    {
      user: "Pode me passar uma ideia de valores para essas datas?",
      name: "Pedido explícito de valores",
      expect:
        /R\$|diária|quarto|su[ií]te|pens[aã]o|disponib|pacote|reserv|link|omnibees|hotelresults|consultei|tarifa|valor/i,
    },
  ]);
  totalPassed += r3.passed;
  totalFailed += r3.failed;

  console.log("\n=== Resultado ===");
  console.log(`Passou: ${totalPassed} | Falhou: ${totalFailed}`);

  if (totalFailed > 0) {
    process.exit(1);
  }
  console.log("\nTodos os testes passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
