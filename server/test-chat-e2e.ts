/**
 * Teste E2E do chat - Agente Ana Julia (PPL Motors)
 * Uso: npx tsx test-chat-e2e.ts [agent_id]
 *
 * Se agent_id não for passado, tenta buscar do banco via API.
 * Execute de dentro da pasta server: npx tsx test-chat-e2e.ts
 */

import "dotenv/config";

const BASE = "http://localhost:3001/api";
// Usar SERVICE_ROLE para bypass RLS ao listar tenants/agents
const NEXUS_URL = process.env.NEXUS_DB_URL ?? "https://boomsolution-supabase.kgn6uc.easypanel.host";
const NEXUS_KEY = process.env.NEXUS_SERVICE_ROLE_KEY ?? process.env.NEXUS_DB_ANON_KEY ?? "";

async function getPplAgentId(): Promise<string | null> {
  const { createClient } = await import("@supabase/supabase-js");
  if (!NEXUS_KEY) {
    console.log("[E2E] NEXUS_SERVICE_ROLE_KEY ou NEXUS_DB_ANON_KEY não configurado");
    return null;
  }
  const supabase = createClient(NEXUS_URL, NEXUS_KEY);

  // Listar todos os tenants para debug
  const { data: allTenants } = await supabase.from("tenants").select("id, slug, name");
  console.log("[E2E] Tenants no banco:", JSON.stringify(allTenants, null, 2));

  const tenant = (allTenants || []).find((t: any) =>
    ["ppl-motors", "ppl-mortors"].includes((t.slug || "").toLowerCase())
  );
  const tenantId = tenant?.id;
  if (!tenantId) {
    // Fallback: listar todos os agentes e buscar por nome
    const { data: allAgents } = await supabase.from("agents").select("id, name, tenant_id").limit(20);
    console.log("[E2E] Agentes (fallback):", JSON.stringify(allAgents, null, 2));
    const pplAgent = (allAgents || []).find(
      (a: any) => /ana|julia|ppl|juliana/i.test(a.name || "")
    );
    if (pplAgent) {
      console.log("[E2E] Usando agente (fallback):", pplAgent.name, "| ID:", pplAgent.id);
      return pplAgent.id;
    }
    console.log("[E2E] Tenant PPL Motors não encontrado. Slugs disponíveis:", (allTenants || []).map((t: any) => t.slug));
    return null;
  }

  const { data: agents } = await supabase.from("agents").select("id, name, tenant_id").eq("tenant_id", tenantId).limit(5);
  console.log("[E2E] Agentes do tenant:", JSON.stringify(agents, null, 2));
  const agent = agents?.[0];
  if (agent) {
    console.log("[E2E] Usando agente:", agent.name, "| ID:", agent.id);
    return agent.id;
  }
  return null;
}

async function testChat(agentId: string) {
  const body = {
    agent_id: agentId,
    messages: [{ role: "user", content: "Oi! Estou procurando um Corolla 2024. Vocês têm disponível?" }],
    conversation_id: null,
  };

  console.log("\n[E2E] Enviando POST", BASE + "/chat");
  console.log("[E2E] Body:", JSON.stringify(body, null, 2));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const resp = await fetch(BASE + "/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdWV2aW9vb3R0cm9zdGJ4a2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU0MTcsImV4cCI6MjA4NzY5MTQxN30.tyit0WSRozRY7C5zlGQAEBjE5zuv0ZtzCNZWM7BxVz0"}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log("[E2E] Status:", resp.status, resp.statusText);
    console.log("[E2E] Content-Type:", resp.headers.get("content-type"));

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[E2E] Erro:", text);
      return;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      console.log("[E2E] Recebendo stream SSE...");
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;
      let hasContent = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              console.log("[E2E] Stream finalizado com [DONE]");
              break;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              chunkCount++;
              if (parsed.error) {
                console.error("[E2E] Erro no stream:", parsed.error);
              }
              if (parsed.choices?.[0]?.delta?.content) {
                hasContent = true;
                process.stdout.write(parsed.choices[0].delta.content);
              }
              if (parsed.conversation_id) {
                console.log("\n[E2E] conversation_id:", parsed.conversation_id);
              }
            } catch {
              // skip
            }
          }
        }
        if (done) break;
      }

      console.log("\n[E2E] Total chunks:", chunkCount, "| Teve conteúdo de texto:", hasContent);
    } else {
      const data = await resp.json();
      console.log("[E2E] Resposta JSON:", JSON.stringify(data, null, 2));
    }
  } catch (e: any) {
    clearTimeout(timeout);
    console.error("[E2E] Exceção:", e.message || e);
  }
}

async function main() {
  let agentId = process.argv[2];
  if (!agentId) {
    agentId = (await getPplAgentId()) || "";
  }
  if (!agentId) {
    console.error("Uso: npx tsx server/test-chat-e2e.ts <agent_id>");
    console.error("Ou configure NEXUS_DB_URL e NEXUS_DB_ANON_KEY para buscar automaticamente.");
    process.exit(1);
  }

  await testChat(agentId);
}

main();
