/**
 * Teste E2E — Chamadas de tool no sandbox (PPL Motors / Ana Júlia)
 * Valida que o dispatcher (gpt-4o-mini) chama as ferramentas corretamente.
 *
 * Uso: npx tsx scripts/e2e-tool-calls.ts [agent_id]
 * Requer servidor rodando (npm run dev) e NEXUS_DB_URL/NEXUS_SERVICE_ROLE_KEY.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.API_BASE_URL || "http://localhost:3001";
const CHAT_URL = `${BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/chat`;
const AUTH =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdWV2aW9vb3R0cm9zdGJ4a2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU0MTcsImV4cCI6MjA4NzY5MTQxN30.tyit0WSRozRY7C5zlGQAEBjE5zuv0ZtzCNZWM7BxVz0";

interface StreamResult {
  content: string;
  conversationId: string | null;
  toolNames: string[];
  toolCallsCount: number;
  error?: string;
}

async function streamChat(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  conversationId: string | null
): Promise<StreamResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  const result: StreamResult = {
    content: "",
    conversationId: null,
    toolNames: [],
    toolCallsCount: 0,
  };

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
      result.error = `HTTP ${resp.status}: ${text.slice(0, 300)}`;
      return result;
    }

    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/event-stream")) {
      const data = await resp.json().catch(() => ({}));
      result.content = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "";
      result.conversationId = data?.conversation_id ?? null;
      return result;
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
              result.error = String(parsed.error);
              return result;
            }
            if (parsed.conversation_id) result.conversationId = parsed.conversation_id;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) result.content += delta;

            // Capturar tool calls do debug (dual-provider)
            const debug = parsed.debug;
            if (Array.isArray(debug)) {
              for (const d of debug) {
                if (d?.type === "dispatcher_tool_calls" && Array.isArray(d.tool_names)) {
                  result.toolNames = d.tool_names;
                  result.toolCallsCount = d.tool_calls_count ?? d.tool_names.length;
                }
                if (d?.type === "tool_call" && d.tool) {
                  if (!result.toolNames.includes(d.tool)) {
                    result.toolNames.push(d.tool);
                    result.toolCallsCount++;
                  }
                }
              }
            } else if (parsed.debug?.type === "dispatcher_tool_calls") {
              const d = parsed.debug;
              result.toolNames = d.tool_names || [];
              result.toolCallsCount = d.tool_calls_count ?? result.toolNames.length;
            }
          } catch {
            /* skip */
          }
        }
      }
      if (done) break;
    }

    return result;
  } catch (e: unknown) {
    clearTimeout(timeout);
    result.error = (e as Error).message || String(e);
    return result;
  }
}

async function getPplAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: tenants } = await supabase.from("tenants").select("id, slug, name");
  const tenant = (tenants || []).find((t: { slug?: string }) =>
    ["ppl-motors", "ppl-mortors"].includes((t.slug || "").toLowerCase())
  );
  if (!tenant) return null;

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .limit(1);
  return agents?.[0]?.id ?? null;
}

interface Scenario {
  name: string;
  userMessage: string;
  expectTools: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "Consulta Corolla 2024 → consultar_estoque",
    userMessage: "Oi! Estou procurando um Corolla 2024. Vocês têm disponível? Qual o preço?",
    expectTools: ["consultar_estoque"],
  },
  {
    name: "Consulta Audi A3 → consultar_estoque",
    userMessage: "Tem algum Audi A3 aí?",
    expectTools: ["consultar_estoque"],
  },
  {
    name: "Consulta genérica SUV → consultar_estoque",
    userMessage: "O que vocês têm de SUV?",
    expectTools: ["consultar_estoque"],
  },
];

async function main() {
  let agentId = process.argv[2];
  if (!agentId) {
    agentId = (await getPplAgentId()) || "";
  }
  if (!agentId) {
    console.error("Uso: npx tsx scripts/e2e-tool-calls.ts <agent_id>");
    console.error("Ou configure NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY para buscar o agente PPL Motors.");
    process.exit(1);
  }

  console.log("\n=== E2E Tool Calls — Sandbox (PPL Motors) ===\n");
  console.log("Agent ID:", agentId);
  console.log("CHAT_URL:", CHAT_URL);
  console.log("");

  let convId: string | null = null;
  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    console.log(`\n--- ${scenario.name} ---`);
    console.log("User:", scenario.userMessage);

    const messages = [{ role: "user" as const, content: scenario.userMessage }];
    const res = await streamChat(agentId, messages, convId);

    if (res.error) {
      console.error("  ✗ Erro:", res.error);
      failed++;
      continue;
    }

    convId = res.conversationId;
    console.log("  Tools chamadas:", res.toolNames.length ? res.toolNames.join(", ") : "(nenhuma)");
    console.log("  Resposta (preview):", res.content.slice(0, 150) + (res.content.length > 150 ? "..." : ""));

    const hasExpected = scenario.expectTools.every((t) => res.toolNames.includes(t));
    if (hasExpected && res.toolNames.length > 0) {
      console.log("  ✓ PASS — tool(s) esperada(s) chamada(s)");
      passed++;
    } else if (res.toolNames.length === 0) {
      console.log("  ✗ FAIL — nenhuma tool chamada (esperado:", scenario.expectTools.join(", ") + ")");
      failed++;
    } else {
      const missing = scenario.expectTools.filter((t) => !res.toolNames.includes(t));
      console.log("  ✗ FAIL — tools faltando:", missing.join(", "));
      failed++;
    }
  }

  console.log("\n=== Resultado ===\n");
  console.log(`Passou: ${passed}/${SCENARIOS.length}`);
  console.log(`Falhou: ${failed}/${SCENARIOS.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
