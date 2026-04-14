/**
 * Teste E2E — Agente Bia (Autoescola Ideal)
 * Fluxos: abertura, orçamento, exame de moto (Alameda do Horto), agenda (sem inventar horário), dois orçamentos.
 *
 * Uso: npx tsx scripts/e2e-autoescola-ideal.ts [agent_id]
 * Requer servidor rodando (npm run dev na API) e NEXUS_DB_URL + NEXUS_SERVICE_ROLE_KEY (ou agent_id na linha de comando).
 *
 * Testes estáticos do prompt (sem LLM): na raiz do repo, `npm test -- --run server/src/services/prompts/autoescola-ideal.prompt.test.ts`
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.API_BASE_URL || "http://localhost:3001";
const CHAT_URL = `${BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/chat`;
const AUTH =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdWV2aW9vb3R0cm9zdGJ4a2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU0MTcsImV4cCI6MjA4NzY5MTQxN30.tyit0WSRozRY7C5zlGQAEBjE5zuv0ZtzCNZWM7BxVz0";

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
  const timeout = setTimeout(() => controller.abort(), 60000);

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
        error: `HTTP ${resp.status}: ${text.slice(0, 300)}`,
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

async function getIdealAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug")
    .in("slug", ["ideal", "autoescola-ideal", "auto-escola-ideal"])
    .limit(3);

  const tenant = tenants?.[0];
  if (!tenant) {
    const { data: all } = await supabase.from("tenants").select("id, slug").limit(20);
    console.log("[E2E] Tenants disponíveis:", (all || []).map((t: any) => t.slug));
    return null;
  }

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .limit(1);

  return agents?.[0]?.id ?? null;
}

function check(content: string, turn: Turn): { ok: boolean; msg: string } {
  const lower = content.toLowerCase();
  if (turn.expect) {
    const re = typeof turn.expect === "string" ? new RegExp(turn.expect, "i") : turn.expect;
    if (!re.test(content)) {
      return { ok: false, msg: `Esperava "${turn.expect}" em: ${content.slice(0, 200)}...` };
    }
  }
  if (turn.expectNot) {
    const re = typeof turn.expectNot === "string" ? new RegExp(turn.expectNot, "i") : turn.expectNot;
    if (re.test(content)) {
      return { ok: false, msg: `Esperava NÃO ter "${turn.expectNot}" em: ${content.slice(0, 200)}...` };
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
      console.log(`  Resposta: ${r.content.slice(0, 300)}...`);
      failed++;
    }
  }

  return { passed, failed };
}

async function main() {
  let agentId = process.argv[2];
  if (!agentId) {
    agentId = (await getIdealAgentId()) || "";
  }
  if (!agentId) {
    console.error("Uso: npx tsx scripts/e2e-autoescola-ideal.ts [agent_id]");
    console.error("Ou configure NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY para buscar o agente.");
    process.exit(1);
  }

  console.log("=== E2E Autoescola Ideal (Bia) ===");
  console.log("Agent ID:", agentId);

  let totalPassed = 0;
  let totalFailed = 0;

  // Fluxo 1: Abertura + nome
  const r1 = await runFlow(agentId, "Abertura + nome", [
    { user: "oi", name: "Abertura", expect: /bia|ideal|chamar/i, expectNot: /tudo bem por aí/i },
    { user: "Me chamo Lucas", name: "Nome", expect: /já é aluno|aluna/i },
  ]);
  totalPassed += r1.passed;
  totalFailed += r1.failed;

  // Fluxo 2: Lead novo + orçamento B + primeira vez (qualificação: experiência → exames → consultoria 2×8 → orçamento)
  const r2 = await runFlow(agentId, "Orçamento B + primeira vez", [
    { user: "oi", name: "Abertura" },
    { user: "Me chamo Lucas", name: "Nome" },
    { user: "Não, não sou aluno", name: "Não é aluno" },
    { user: "Quero orçamento para categoria B", name: "Pedido orçamento" },
    {
      user: "Vai ser minha primeira vez",
      name: "Primeira vez",
      expect: /médico|psicotécnico|teórico|já (fez|dirige)|dirige carro/i,
    },
    {
      user: "Não, ainda não fiz médico, psicotécnico nem teórico",
      name: "Não fez exames",
      expect: /duas aulas|mais aulas|pacote|recomenda|8|orçamento|R\$/i,
    },
    { user: "Quero 8 aulas", name: "Escolha 8", expect: /R\$\s*940|940,00|156,67|aulas|teórico|médico|Detran/i },
  ]);
  totalPassed += r2.passed;
  totalFailed += r2.failed;

  // Fluxo 3: Já fez médico, psicotécnico e teórico (orçamento básico)
  const r3 = await runFlow(agentId, "Já fez exames médico, psicotécnico e teórico", [
    { user: "oi", name: "Abertura" },
    { user: "Me chamo Maria", name: "Nome" },
    { user: "Não sou aluno", name: "Não é aluno" },
    { user: "Quero orçamento para moto, categoria A", name: "Pedido orçamento A" },
    { user: "Já piloto", name: "Experiência" },
    { user: "Já fiz o médico, psicotécnico e teórico", name: "Já fez exames", expectNot: /agendamento|marcação de exames|consultoria|acompanhamento/i },
  ]);
  totalPassed += r3.passed;
  totalFailed += r3.failed;

  // Fluxo 5: Local do exame de moto (Alameda do Horto — não confundir com pista)
  const r5 = await runFlow(agentId, "Exame prático de moto — endereço correto", [
    { user: "oi", name: "Abertura" },
    { user: "Me chamo Fernanda", name: "Nome" },
    { user: "Não sou aluna", name: "Não é aluno" },
    { user: "Quero tirar CNH só de moto, categoria A", name: "Categoria A" },
    { user: "Vai ser minha primeira vez pilotando", name: "Primeira vez" },
    { user: "Ainda não fiz médico, psicotécnico nem teórico", name: "Exames pendentes" },
    {
      user: "Só uma dúvida: o exame prático da moto é na mesma pista das aulas?",
      name: "Pergunta exame x pista",
      expect: /Alameda do Horto|Horto,?\s*144/i,
    },
  ]);
  totalPassed += r5.passed;
  totalFailed += r5.failed;

  // Fluxo 6: Agenda de aulas — não inventar horário; encaminhar unidade
  const r6 = await runFlow(agentId, "Agenda de aulas — sem disponibilidade inventada", [
    { user: "oi", name: "Abertura" },
    { user: "Me chamo Roberto", name: "Nome" },
    { user: "Não sou aluno", name: "Não é aluno" },
    { user: "Quero orçamento categoria B", name: "Pedido B" },
    { user: "Primeira vez dirigindo", name: "Experiência" },
    { user: "Já fiz médico, psicotécnico e teórico", name: "Exames ok" },
    {
      user: "Beleza. Consigo marcar minha primeira aula para quinta-feira às 16h?",
      name: "Pedido de slot específico",
      expect: /unidade|equipe|matrícula|não consigo|por aqui|agenda|não tenho|alinha(m|mos)|encaixa(m|mos)/i,
    },
  ]);
  totalPassed += r6.passed;
  totalFailed += r6.failed;

  // Fluxo 4: Dois orçamentos (B e AB) + dúvidas sobre pacotes + indicação
  const r4 = await runFlow(agentId, "Dois orçamentos + dúvidas + indicação", [
    { user: "oi", name: "Abertura" },
    { user: "Me chamo Pedro", name: "Nome" },
    { user: "Não sou aluno", name: "Não é aluno" },
    { user: "Quero orçamento de carro e também de carro e moto", name: "Dois orçamentos B e AB", expect: /experiência|primeira vez|dirige|pilota/i },
    {
      user: "Vai ser minha primeira vez nas duas",
      name: "Primeira vez",
      expect: /médico|psicotécnico|teórico|já fez|exame/i,
    },
    {
      user: "Não, ainda não fiz médico, psicotécnico nem teórico",
      name: "Não fez exames",
      expect: /duas aulas|mais aulas|recomenda|pacote|orçamento|8|aulas/i,
    },
    { user: "Quero 8 aulas de cada", name: "Escolha 8", expect: /R\$\s*\d|940|1\.740|1,740|carro|moto/i },
    { user: "E qual pacote com mais aulas?", name: "Pergunta mais aulas", expect: /R\$\s*\d|aula|10|12|14|16|18|20/i },
    { user: "E com menos aulas?", name: "Pergunta menos aulas", expect: /R\$\s*\d|aula|2|4|6/i },
    {
      user: "Qual pacote você indica?",
      name: "Pergunta indicação",
      expect: /recomendo|indico|8|10|R\$\s*\d|op(ç|c)[aã]o|sentido|duas categorias|resolve|economiza/i,
    },
  ]);
  totalPassed += r4.passed;
  totalFailed += r4.failed;

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
