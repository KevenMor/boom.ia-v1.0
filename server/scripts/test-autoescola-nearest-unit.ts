import "dotenv/config";

type Msg = { role: "user" | "assistant"; content: string };

type CaseResult = {
  name: string;
  ok: boolean;
  detail: string;
  content?: string;
  toolCalls?: Array<{ tool?: string; args?: Record<string, unknown> }>;
  toolResults?: Array<{ preview?: unknown }>;
};

const BASE = "http://127.0.0.1:3001";
const URL = `${BASE}/api/chat`;
const AGENT_ID = "82c50d30-0034-43f4-b7e7-f1c125db44e2"; // Beatriz
const AUTH = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChat(messages: Msg[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const resp = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nexus-auth": AUTH ? `Bearer ${AUTH}` : "",
    },
    body: JSON.stringify({ agent_id: AGENT_ID, messages, conversation_id: null }),
    signal: controller.signal,
  });

  if (!resp.ok) {
    clearTimeout(timeout);
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 260)}`);
  }

  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) {
    clearTimeout(timeout);
    const data = await resp.json().catch(() => ({}));
    return { content: String(data?.choices?.[0]?.message?.content || ""), toolCalls: [], toolResults: [] };
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: Array<{ tool?: string; args?: Record<string, unknown> }> = [];
  const toolResults: Array<{ preview?: unknown }> = [];

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;

      const payload = line.slice(6).trim();
      if (payload === "[DONE]") {
        clearTimeout(timeout);
        return { content, toolCalls, toolResults };
      }

      try {
        const ev = JSON.parse(payload);
        const delta = ev?.choices?.[0]?.delta?.content;
        if (delta) content += delta;

        if (Array.isArray(ev?.debug)) {
          for (const d of ev.debug) {
            if (d?.type === "tool_call") toolCalls.push({ tool: d.tool, args: d.args });
            if (d?.type === "tool_result") toolResults.push({ preview: d.preview });
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }

    if (done) {
      clearTimeout(timeout);
      return { content, toolCalls, toolResults };
    }
  }
}

function findCepFromCalls(calls: Array<{ tool?: string; args?: Record<string, unknown> }>): string | undefined {
  const c = calls.find((x) => /consultar_unidade|nearest_unit|consultar_cep/i.test(String(x.tool || "")));
  const cep = c?.args?.cep;
  return typeof cep === "string" ? cep : undefined;
}

async function testCase(name: string, messages: Msg[], validate: (r: Awaited<ReturnType<typeof runChat>>) => { ok: boolean; detail: string }): Promise<CaseResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await runChat(messages);
      const v = validate(r);
      return { name, ok: v.ok, detail: v.detail, content: r.content, toolCalls: r.toolCalls, toolResults: r.toolResults };
    } catch (e: unknown) {
      if (attempt === 2) return { name, ok: false, detail: (e as Error)?.message || String(e) };
      await sleep(1000);
    }
  }
  return { name, ok: false, detail: "erro inesperado" };
}

const results: CaseResult[] = [];

results.push(await testCase(
  "CEP com hífen deve chamar tool com cep normalizado",
  [{ role: "user", content: "18046-166" }],
  (r) => {
    const cep = findCepFromCalls(r.toolCalls);
    return {
      ok: cep === "18046166",
      detail: cep ? `cep capturado na tool: ${cep}` : "nenhuma chamada de consultar_unidade detectada",
    };
  }
));
await sleep(1200);

results.push(await testCase(
  "CEP sem hífen deve chamar tool com cep",
  [{ role: "user", content: "18046166" }],
  (r) => {
    const cep = findCepFromCalls(r.toolCalls);
    return {
      ok: cep === "18046166",
      detail: cep ? `cep capturado na tool: ${cep}` : "nenhuma chamada de consultar_unidade detectada",
    };
  }
));
await sleep(1200);

results.push(await testCase(
  "Sem CEP não deve alucinar unidade; deve pedir CEP",
  [{ role: "user", content: "qual unidade mais próxima?" }],
  (r) => {
    const txt = (r.content || "").toLowerCase();
    const asksCep = /cep/.test(txt);
    const hallucinatedUnit = /(j[uú]lio\s+de\s+mesquita|vila\s+haro|vila\s+helena|aparecidinha|coop\s+zona\s+norte)/i.test(txt);
    return {
      ok: asksCep && !hallucinatedUnit,
      detail: `asksCep=${asksCep} hallucinatedUnit=${hallucinatedUnit}`,
    };
  }
));
await sleep(1200);

results.push(await testCase(
  "Fallback histórico deve preencher cep ausente na chamada",
  [
    { role: "user", content: "meu cep é 18046166" },
    { role: "assistant", content: "Perfeito, me diga como posso ajudar." },
    { role: "user", content: "qual unidade mais próxima?" },
  ],
  (r) => {
    const cep = findCepFromCalls(r.toolCalls);
    return {
      ok: cep === "18046166",
      detail: cep ? `cep capturado na tool: ${cep}` : "nenhuma chamada de consultar_unidade detectada",
    };
  }
));

console.log("\n=== RESULTADO TESTE FUNCIONAL (AUTO ESCOLA IDEAL) ===");
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name} -> ${r.detail}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`\nFalhas: ${failed.length}`);
  process.exit(1);
}

console.log("\nTodos os testes funcionais passaram.");
