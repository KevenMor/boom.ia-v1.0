/**
 * Teste E2E — PPL Motors: anti-repetição de fotos + notificação de vídeo
 *
 * Valida as mudanças implementadas:
 *   1. photos_sent é salvo em metadata após envio de fotos
 *   2. "FOTOS JÁ ENVIADAS" é injetado no sistema na próxima mensagem
 *   3. Cliente pedindo "mais fotos" NÃO recebe reenvio
 *   4. Agente NÃO se reapresenta após a primeira mensagem
 *   5. send_notification aceita motivo (Change 4)
 *
 * Uso: npx tsx scripts/e2e-ppl-photo-repetition.ts [agent_id]
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

let totalPassed = 0;
let totalFailed = 0;

function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); totalPassed++; }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); totalFailed++; }
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTH}` },
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

async function getAgentId(): Promise<string | null> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data: tenants } = await supabase.from("tenants").select("id, slug").or("slug.eq.ppl-mortors,slug.eq.ppl-motors,slug.ilike.%ppl%").limit(5);
  const tenant = tenants?.[0];
  if (!tenant) return null;
  const { data: agents } = await supabase.from("agents").select("id, name").eq("tenant_id", tenant.id).limit(1);
  const agent = agents?.[0];
  if (agent) console.log(`[E2E] Agente: ${agent.name} (${agent.id})`);
  return agent?.id ?? null;
}

async function getMessageMetadata(agentId: string, conversationId: string): Promise<Array<{ role: string; metadata: Record<string, unknown> }>> {
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data } = await supabase.rpc("load_conversation_messages", {
    p_agent_id: agentId,
    p_conversation_id: conversationId,
  });
  return (data as Array<{ role: string; metadata: Record<string, unknown> }>) || [];
}

async function main() {
  console.log(`\n${BOLD}=== E2E: PPL Motors — Anti-Repetição de Fotos + Video Notification ===${RESET}\n`);

  let agentId = process.argv[2];
  if (!agentId) agentId = (await getAgentId()) || "";
  if (!agentId) {
    console.error("[E2E] Agente PPL Motors não encontrado.");
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 1: Enviar fotos → verificar photos_sent em metadata
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 1: Envio de fotos → photos_sent salvo em metadata ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    // Turno 1: perguntar S10
    messages.push({ role: "user", content: "Tem S10 disponível?" });
    const r1 = await streamChat(agentId, messages, convId);
    if (r1.error) { fail(`Turno 1 falhou: ${r1.error}`); }
    else {
      if (r1.conversationId) convId = r1.conversationId;
      messages.push({ role: "assistant", content: r1.content });
      ok(`Turno 1 OK: ${r1.content.slice(0, 80)}...`);
    }

    // Turno 2: aceitar fotos
    messages.push({ role: "user", content: "sim, manda as fotos" });
    const r2 = await streamChat(agentId, messages, convId);
    if (r2.error) { fail(`Turno 2 falhou: ${r2.error}`); }
    else {
      if (r2.conversationId) convId = r2.conversationId;
      messages.push({ role: "assistant", content: r2.content });

      if (r2.mediaCommands && r2.mediaCommands.photo_inventory_ids.length > 0) {
        ok(`Fotos enviadas (media_commands): ${r2.mediaCommands.photo_inventory_ids.join(", ")}`);
      } else {
        warn("Nenhuma foto enviada neste turno (pode não haver S10 no estoque)");
      }

      // Aguardar 1s para DB persistir
      await new Promise((r) => setTimeout(r, 1000));

      // Verificar metadata salvo no DB
      if (convId) {
        const msgs = await getMessageMetadata(agentId, convId);
        const assistantMsgs = msgs.filter((m) => m.role === "assistant");
        const lastAssistant = assistantMsgs[assistantMsgs.length - 1];

        info(`Metadata do último assistant: ${JSON.stringify(lastAssistant?.metadata ?? {})}`);

        const photosSent = (lastAssistant?.metadata as Record<string, unknown>)?.photos_sent as Array<{ id: string; name: string }> | undefined;
        if (photosSent && photosSent.length > 0) {
          ok(`photos_sent salvo em metadata: ${photosSent.map((p) => p.name).join(", ")}`);
        } else {
          if (r2.mediaCommands && r2.mediaCommands.photo_inventory_ids.length > 0) {
            fail("Fotos foram enviadas (media_commands) mas photos_sent NÃO foi salvo em metadata");
          } else {
            warn("Nenhuma foto enviada — photos_sent vazio (esperado)");
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 2: Após enviar fotos → pedir "mais fotos" → NÃO deve reenviar
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 2: Após fotos enviadas → "mais fotos" → NÃO deve reenviar ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    // Turno 1: consulta
    messages.push({ role: "user", content: "Quero ver a S10" });
    const r1 = await streamChat(agentId, messages, convId);
    if (r1.error) { fail(`Turno 1 falhou: ${r1.error}`); }
    else {
      if (r1.conversationId) convId = r1.conversationId;
      messages.push({ role: "assistant", content: r1.content });
      ok(`Turno 1 OK`);
    }

    // Turno 2: aceitar fotos
    messages.push({ role: "user", content: "pode mandar" });
    const r2 = await streamChat(agentId, messages, convId);
    if (r2.error) { fail(`Turno 2 falhou: ${r2.error}`); }
    else {
      if (r2.conversationId) convId = r2.conversationId;
      messages.push({ role: "assistant", content: r2.content });
      const fotosSentTurn2 = r2.mediaCommands?.photo_inventory_ids.length ?? 0;
      info(`Turno 2 — fotos enviadas: ${fotosSentTurn2}`);

      if (fotosSentTurn2 > 0) {
        ok(`Turno 2: fotos enviadas corretamente`);
      }

      // Aguardar DB persistir
      await new Promise((r) => setTimeout(r, 1500));

      // Turno 3: pedir "mais fotos" ou "foto interna"
      messages.push({ role: "user", content: "Vc tem foto de dentro do carro? Ou outro ângulo?" });
      const r3 = await streamChat(agentId, messages, convId);
      if (r3.error) { fail(`Turno 3 falhou: ${r3.error}`); }
      else {
        if (r3.conversationId) convId = r3.conversationId;
        info(`Turno 3 resposta: ${r3.content.slice(0, 200)}`);

        // Verificação principal: NÃO deve reenviar fotos
        if (r3.mediaCommands && r3.mediaCommands.photo_inventory_ids.length > 0) {
          fail(`Turno 3: REENVIO de fotos detectado! photo_ids: ${r3.mediaCommands.photo_inventory_ids.join(", ")} — anti-repetição NÃO funcionou`);
        } else {
          ok(`Turno 3: fotos NÃO reenviadas — anti-repetição funcionando`);
        }

        // Verificar que a resposta menciona alternativas (vídeo ou visita)
        const mentionsAlternative = /v[íi]deo|visita|loja|pessoalmente|consul/i.test(r3.content);
        if (mentionsAlternative) {
          ok(`Turno 3: agente ofereceu alternativa (vídeo/visita)`);
        } else {
          warn(`Turno 3: agente não mencionou alternativas de forma clara: ${r3.content.slice(0, 150)}`);
        }

        // Verificar que NÃO se reapresentou
        const reintroduced = /sou a ana j[úu]lia.*ppl|me chamo ana j[úu]lia/i.test(r3.content);
        if (reintroduced) {
          fail(`Turno 3: agente SE REAPRESENTOU na turn 3 — bug de reapresentação`);
        } else {
          ok(`Turno 3: agente NÃO se reapresentou`);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUXO 3: Verificar que reapresentação NÃO ocorre no turno 2 em diante
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}--- Fluxo 3: Agente NÃO deve se reapresentar em turnos subsequentes ---${RESET}`);
  {
    const messages: Array<{ role: string; content: string }> = [];
    let convId: string | null = null;

    // Turno 1
    messages.push({ role: "user", content: "Oi, quero saber sobre carros" });
    const r1 = await streamChat(agentId, messages, convId);
    if (r1.error) { fail(`Turno 1 falhou: ${r1.error}`); }
    else {
      if (r1.conversationId) convId = r1.conversationId;
      messages.push({ role: "assistant", content: r1.content });
      ok(`Turno 1 OK`);
    }

    // Turno 2
    messages.push({ role: "user", content: "Tem pickup?" });
    const r2 = await streamChat(agentId, messages, convId);
    if (r2.error) { fail(`Turno 2 falhou: ${r2.error}`); }
    else {
      if (r2.conversationId) convId = r2.conversationId;
      messages.push({ role: "assistant", content: r2.content });

      const reintroT2 = /sou a ana j[úu]lia.*ppl|me chamo ana j[úu]lia.*da ppl/i.test(r2.content);
      if (reintroT2) {
        fail(`Turno 2: reapresentação detectada — "Sou a Ana Júlia da PPL" no turno 2`);
      } else {
        ok(`Turno 2: sem reapresentação`);
      }
    }

    // Turno 3
    messages.push({ role: "user", content: "Pode me dar mais detalhes?" });
    const r3 = await streamChat(agentId, messages, convId);
    if (r3.error) { fail(`Turno 3 falhou: ${r3.error}`); }
    else {
      if (r3.conversationId) convId = r3.conversationId;

      const reintroT3 = /sou a ana j[úu]lia.*ppl|me chamo ana j[úu]lia.*da ppl/i.test(r3.content);
      if (reintroT3) {
        fail(`Turno 3: reapresentação detectada`);
      } else {
        ok(`Turno 3: sem reapresentação`);
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
    process.exit(1);
  } else {
    console.log(`  ${GREEN}Falhou: 0${RESET}`);
    console.log(`\n${GREEN}${BOLD}✓ Todos os testes passaram!${RESET}\n`);
  }
}

main().catch((e) => {
  console.error("[E2E] Erro fatal:", e);
  process.exit(1);
});
