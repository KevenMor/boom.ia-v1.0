/**
 * E2E — Orçamento Pousada Flores do Lázaro (chat-local + Artaxnet).
 *
 * Requer: server rodando, .env com NEXUS_DB_URL + chave,
 * agente pousada-flores-do-lazaro com tool consultar_disponibilidade_flores_lazaro.
 *
 * Uso: cd server && npx tsx scripts/e2e-flores-lazaro-orcamento.ts
 * Opcional: FLORES_E2E_AGENT_ID=uuid
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAT_LOCAL = `${BASE}/api/chat-local`;

interface ArtaxnetPreview {
  roomCount?: number;
  summaryText?: string;
  rooms?: Array<{ roomName?: string }>;
  bookingUrl?: string;
}

function parseSseStream(raw: string): { content: string; debugBlobs: unknown[] } {
  let content = "";
  const debugBlobs: unknown[] = [];
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t.startsWith("data: ")) continue;
    const jsonStr = t.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      const ev = JSON.parse(jsonStr);
      const delta = ev.choices?.[0]?.delta?.content;
      if (typeof delta === "string") content += delta;
      if (ev.debug) debugBlobs.push(ev.debug);
    } catch {
      /* skip */
    }
  }
  return { content, debugBlobs };
}

function extractLastArtaxnetFromDebug(debugBlobs: unknown[]): ArtaxnetPreview | null {
  let last: ArtaxnetPreview | null = null;
  for (const blob of debugBlobs) {
    if (!Array.isArray(blob)) continue;
    for (const entry of blob) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { type?: string; preview?: unknown };
      if (e.type !== "tool_result" || !e.preview || typeof e.preview !== "object") continue;
      const p = e.preview as Record<string, unknown>;
      if (typeof p.summaryText === "string" || Array.isArray(p.rooms) || typeof p.roomCount === "number") {
        last = {
          roomCount: typeof p.roomCount === "number" ? p.roomCount : Array.isArray(p.rooms) ? p.rooms.length : undefined,
          summaryText: typeof p.summaryText === "string" ? p.summaryText : undefined,
          rooms: Array.isArray(p.rooms)
            ? (p.rooms as Array<{ roomName?: string }>).map((r) => ({ roomName: r.roomName }))
            : undefined,
          bookingUrl: typeof p.bookingUrl === "string" ? p.bookingUrl : undefined,
        };
      }
    }
  }
  return last;
}

async function resolveAgentId(): Promise<string> {
  const fromEnv = process.env.FLORES_E2E_AGENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY necessários");

  const supabase = createClient(url, key);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "pousada-flores-do-lazaro")
    .maybeSingle();
  if (!tenant?.id) throw new Error("Tenant pousada-flores-do-lazaro não encontrado");

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .maybeSingle();
  if (!agent?.id) throw new Error("Nenhum agente para tenant pousada-flores-do-lazaro");
  return agent.id;
}

async function runTurn(
  agentId: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ assistantText: string; artaxnet: ArtaxnetPreview | null }> {
  const resp = await fetch(CHAT_LOCAL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.NEXUS_SERVICE_ROLE_KEY
        ? { "x-nexus-auth": `Bearer ${process.env.NEXUS_SERVICE_ROLE_KEY}` }
        : {}),
    },
    body: JSON.stringify({ agent_id: agentId, messages, stream: true }),
  });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`chat-local HTTP ${resp.status}: ${raw.slice(0, 500)}`);
  const { content, debugBlobs } = parseSseStream(raw);
  return { assistantText: content, artaxnet: extractLastArtaxnetFromDebug(debugBlobs) };
}

async function main() {
  const agentId = await resolveAgentId();
  console.log("Agent:", agentId);

  const messages: Array<{ role: string; content: string }> = [
    { role: "user", content: "Oi, quero orçamento para 10 a 15 de junho" },
  ];
  let turn = await runTurn(agentId, messages);
  console.log("\n--- Turno 1 (sem ocupação) ---\n", turn.assistantText.slice(0, 400));
  if (turn.artaxnet) console.warn("WARN: tool chamada sem ocupação completa");

  messages.push({ role: "assistant", content: turn.assistantText });
  messages.push({ role: "user", content: "Keven. Somos 2 adultos, sem crianças." });
  turn = await runTurn(agentId, messages);
  console.log("\n--- Turno 2 (qualificado) ---\n", turn.assistantText.slice(0, 800));

  if (turn.artaxnet) {
    console.log("\nArtaxnet roomCount:", turn.artaxnet.roomCount);
    console.log("bookingUrl:", turn.artaxnet.bookingUrl);
    if ((turn.artaxnet.roomCount ?? 0) < 1) {
      console.error("FAIL: roomCount < 1");
      process.exit(1);
    }
    if (!turn.assistantText.match(/R\$\s*[\d.]+,\d{2}/)) {
      console.warn("WARN: resposta sem R$ visível (pode ser reformulação do modelo)");
    }
    console.log("\nE2E OK — consulta Artaxnet executada.");
  } else {
    console.error("FAIL: nenhum resultado Artaxnet no debug");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
