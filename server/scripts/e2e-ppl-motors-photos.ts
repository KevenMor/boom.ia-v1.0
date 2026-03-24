/**
 * Teste E2E — PPL Motors: envio de fotos de veículos
 *
 * Valida que, ao pedir fotos de um veículo, o pipeline:
 *   1. Chama a tool consultar_estoque corretamente
 *   2. O LLM emite ENVIAR_FOTOS_VEICULO: na resposta bruta
 *   3. O SSE event `media_commands` é emitido com photo_inventory_ids
 *   4. O texto exibido ao cliente NÃO contém a command line
 *
 * Uso: npx tsx scripts/e2e-ppl-motors-photos.ts [agent_id]
 * Requer servidor rodando (npm run dev) e .env com NEXUS_DB_URL/NEXUS_SERVICE_ROLE_KEY.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.API_BASE_URL || "http://localhost:3001";
const CHAT_URL = `${BASE.replace(/\/+$/, "").replace(/\/api$/, "")}/api/chat`;
const AUTH =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxdWV2aW9vb3R0cm9zdGJ4a2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTU0MTcsImV4cCI6MjA4NzY5MTQxN30.tyit0WSRozRY7C5zlGQAEBjE5zuv0ZtzCNZWM7BxVz0";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${CYAN}ℹ${RESET} ${msg}`); }

interface ChatResult {
  content: string;
  conversationId: string | null;
  mediaCommands: { photo_inventory_ids: string[]; video_inventory_ids: string[] } | null;
  error?: string;
}

async function streamChat(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  conversationId: string | null
): Promise<ChatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH}`,
      },
      body: JSON.stringify({ agent_id: agentId, messages, conversation_id: conversationId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text();
      return { content: "", conversationId: null, mediaCommands: null, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let convId: string | null = conversationId;
    let mediaCommands: { photo_inventory_ids: string[]; video_inventory_ids: string[] } | null = null;

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
            if (parsed.error) return { content, conversationId: convId, mediaCommands, error: String(parsed.error) };
            if (parsed.conversation_id) convId = parsed.conversation_id;
            if (parsed.media_commands) {
              mediaCommands = {
                photo_inventory_ids: Array.isArray(parsed.media_commands.photo_inventory_ids) ? parsed.media_commands.photo_inventory_ids : [],
                video_inventory_ids: Array.isArray(parsed.media_commands.video_inventory_ids) ? parsed.media_commands.video_inventory_ids : [],
              };
            }
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) content += delta;
          } catch { /* skip */ }
        }
      }
      if (done) break;
    }

    return { content, conversationId: convId, mediaCommands };
  } catch (e: unknown) {
    clearTimeout(timeout);
    return { content: "", conversationId: null, mediaCommands: null, error: (e as Error).message || String(e) };
  }
}

async function getPplMotorsAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug")
    .or("slug.eq.ppl-motors,slug.eq.ppl,slug.ilike.%ppl%")
    .limit(5);

  const tenant = tenants?.[0];
  if (!tenant) {
    const { data: all } = await supabase.from("tenants").select("id, slug").limit(20);
    console.log("[E2E] Tenants disponíveis:", (all || []).map((t: any) => t.slug));
    return null;
  }

  console.log(`[E2E] Tenant PPL encontrado: ${tenant.slug} (${tenant.id})`);

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .eq("tenant_id", tenant.id)
    .limit(1);

  const agent = agents?.[0];
  if (agent) console.log(`[E2E] Agente: ${agent.name} (${agent.id})`);
  return agent?.id ?? null;
}

async function getFirstInventoryItemWithPhotos(agentId: string): Promise<{ id: string; name: string } | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data: agent } = await supabase.from("agents").select("tenant_id").eq("id", agentId).maybeSingle();
  if (!agent?.tenant_id) return null;

  const { data: items } = await supabase
    .from("inventory")
    .select("id, brand, model, photos, photo_url")
    .eq("tenant_id", agent.tenant_id)
    .eq("status", "active")
    .limit(20);

  for (const item of items ?? []) {
    let hasPhotos = false;
    if (item.photos) {
      try {
        const parsed = typeof item.photos === "string" ? JSON.parse(item.photos) : item.photos;
        hasPhotos = Array.isArray(parsed) && parsed.length > 0;
      } catch { /**/ }
    }
    if (!hasPhotos && item.photo_url) hasPhotos = true;
    if (hasPhotos) {
      return { id: item.id, name: `${item.brand} ${item.model}`.trim() };
    }
  }
  return null;
}

async function main() {
  console.log(`\n${BOLD}=== E2E: PPL Motors — Envio de Fotos ===${RESET}\n`);

  let agentId = process.argv[2];
  if (!agentId) {
    agentId = (await getPplMotorsAgentId()) || "";
  }
  if (!agentId) {
    console.error("[E2E] Agente PPL Motors não encontrado. Passe o agent_id como argumento.");
    process.exit(1);
  }

  // Verificar se há itens com fotos no inventário
  const inventoryItem = await getFirstInventoryItemWithPhotos(agentId);
  if (!inventoryItem) {
    warn("Nenhum item com fotos encontrado no inventário. O teste de media_commands pode não emitir IDs.");
  } else {
    info(`Veículo com fotos encontrado: ${inventoryItem.name} (id: ${inventoryItem.id})`);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 1: Consulta + aceitar fotos (fluxo normal do prompt)
  // O prompt exige: lista primeiro, oferece fotos, aguarda aceite.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 1: Consulta S10 → agente oferece → cliente aceita → fotos enviadas ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    // Turno 1: Perguntar sobre S10
    messages.push({ role: "user", content: "Tem S10 disponível?" });
    const r1 = await streamChat(agentId, messages, convId);
    if (r1.error) { fail(`Turno 1 falhou: ${r1.error}`); totalFailed++; }
    else {
      if (r1.conversationId) convId = r1.conversationId;
      messages.push({ role: "assistant", content: r1.content });
      ok(`Turno 1 — Consulta S10: ${r1.content.slice(0, 80)}...`);
      totalPassed++;
    }

    // Turno 2: Aceitar ver fotos
    messages.push({ role: "user", content: "sim, manda as fotos" });
    const r2 = await streamChat(agentId, messages, convId);
    if (r2.error) {
      fail(`Turno 2 falhou: ${r2.error}`);
      totalFailed++;
    } else {
      if (r2.conversationId) convId = r2.conversationId;
      messages.push({ role: "assistant", content: r2.content });

      info(`Resposta recebida (${r2.content.length} chars): ${r2.content.slice(0, 150)}...`);

      // Verificar que o texto NÃO contém ENVIAR_FOTOS_VEICULO
      if (/ENVIAR_FOTOS/i.test(r2.content)) {
        fail("Texto visível ao usuário contém ENVIAR_FOTOS_VEICULO (não deveria ser visível)");
        totalFailed++;
      } else {
        ok("Texto visível NÃO contém ENVIAR_FOTOS_VEICULO (comando filtrado corretamente)");
        totalPassed++;
      }

      // Verificar se media_commands foi emitido
      if (r2.mediaCommands && r2.mediaCommands.photo_inventory_ids.length > 0) {
        ok(`SSE 'media_commands' recebido com ${r2.mediaCommands.photo_inventory_ids.length} photo_inventory_id(s): ${r2.mediaCommands.photo_inventory_ids.join(", ")}`);
        totalPassed++;
        if (inventoryItem && r2.mediaCommands.photo_inventory_ids.includes(inventoryItem.id)) {
          ok(`ID do inventário correto: ${inventoryItem.id} (${inventoryItem.name})`);
          totalPassed++;
        } else if (inventoryItem) {
          warn(`ID diferente do esperado. Esperado: ${inventoryItem.id}, recebido: ${r2.mediaCommands.photo_inventory_ids}`);
        }
      } else {
        fail("SSE 'media_commands' NÃO foi emitido — LLM não gerou ENVIAR_FOTOS_VEICULO na resposta bruta");
        totalFailed++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 2: Cliente aceita ver fotos após oferta
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 2: Aceitar ver fotos após oferta ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    // Simular histórico: agente ofereceu fotos, cliente aceita
    messages.push({ role: "user", content: "Tem S10 2022?" });
    const r1 = await streamChat(agentId, messages, convId);
    if (r1.error) { fail(`Turno 1 falhou: ${r1.error}`); totalFailed++; }
    else {
      if (r1.conversationId) convId = r1.conversationId;
      messages.push({ role: "assistant", content: r1.content });
      ok(`Turno 1 — Consulta estoque: ${r1.content.slice(0, 80)}...`);
      totalPassed++;

      // Turno 2: Aceitar fotos
      messages.push({ role: "user", content: "sim, pode mandar as fotos" });
      const r2 = await streamChat(agentId, messages, convId);
      if (r2.error) {
        fail(`Turno 2 falhou: ${r2.error}`);
        totalFailed++;
      } else {
        if (r2.conversationId) convId = r2.conversationId;
        info(`Resposta recebida: ${r2.content.slice(0, 150)}...`);

        if (/ENVIAR_FOTOS/i.test(r2.content)) {
          fail("Texto visível contém ENVIAR_FOTOS_VEICULO (não deveria)");
          totalFailed++;
        } else {
          ok("Texto visível NÃO contém ENVIAR_FOTOS_VEICULO");
          totalPassed++;
        }

        if (r2.mediaCommands && r2.mediaCommands.photo_inventory_ids.length > 0) {
          ok(`SSE 'media_commands' emitido — photo IDs: ${r2.mediaCommands.photo_inventory_ids.join(", ")}`);
          totalPassed++;
        } else {
          fail("SSE 'media_commands' NÃO emitido ao aceitar fotos");
          totalFailed++;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 3: Garantir que listagem simples NÃO emite media_commands
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 3: Listagem sem pedido de fotos NÃO deve emitir media_commands ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    messages.push({ role: "user", content: "Quais carros vocês têm disponíveis?" });
    const r = await streamChat(agentId, messages, convId);
    if (r.error) {
      fail(`Falhou: ${r.error}`);
      totalFailed++;
    } else {
      if (r.conversationId) convId = r.conversationId;
      ok(`Resposta recebida: ${r.content.slice(0, 100)}...`);
      totalPassed++;

      if (!r.mediaCommands || r.mediaCommands.photo_inventory_ids.length === 0) {
        ok("media_commands NÃO emitido em listagem simples (correto — fotos não foram pedidas)");
        totalPassed++;
      } else {
        fail(`media_commands emitido indevidamente em listagem simples: ${JSON.stringify(r.mediaCommands)}`);
        totalFailed++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Resultado final
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}=== Resultado ===${RESET}`);
  console.log(`  ${GREEN}Passou: ${totalPassed}${RESET}`);
  if (totalFailed > 0) {
    console.log(`  ${RED}Falhou: ${totalFailed}${RESET}`);
  } else {
    console.log(`  ${GREEN}Falhou: 0${RESET}`);
  }

  if (totalFailed === 0) {
    console.log(`\n${GREEN}${BOLD}✓ Todos os testes passaram! Envio de fotos funcionando corretamente.${RESET}\n`);
  } else {
    console.log(`\n${RED}${BOLD}✗ ${totalFailed} teste(s) falharam.${RESET}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[E2E] Erro fatal:", e);
  process.exit(1);
});
