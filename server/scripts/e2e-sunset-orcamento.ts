/**
 * E2E — Orçamento Sunset Thermas Park (chat-local).
 *
 * Valida o pipeline que une foto+legenda no mesmo balão do WhatsApp:
 *   - formatSunsetLodgingQuoteForDelivery produz blocos pareados com `<<MSG_SPLIT>>`.
 *   - expandDeliveryParts mantém foto+preço como UMA parte (sem quebrar por `\n\n`).
 *
 * Requer:
 *   - server rodando (npm run dev ou dev:all)
 *   - .env com NEXUS_DB_URL + chave
 *   - tenant sunset-thermas-park (ou sunset-thermas) configurado, com tool
 *     `consultar_hospedagem_sunset` no agente, fotos da galeria populadas no bucket
 *     `suite-galleries` para "STANDART" + "LUXO DUPLO" (pelo menos).
 *
 * Uso: cd server && npx tsx scripts/e2e-sunset-orcamento.ts
 * Opcional: SUNSET_E2E_AGENT_ID=uuid npx tsx scripts/e2e-sunset-orcamento.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAT_LOCAL = `${BASE}/api/chat-local`;

interface SunsetDebugPreview {
  available_accommodations?: Array<{ name?: string; total_price?: number }>;
  gallery_photos?: Array<{ accommodationName?: string; imageUrl?: string }>;
  summaryText?: string;
}

interface TurnResult {
  assistantText: string;
  debug: { tool: string; preview: SunsetDebugPreview }[];
  error?: string;
}

function parseSseStream(raw: string): {
  content: string;
  debugBlobs: unknown[];
} {
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

function extractSunsetToolResults(debugBlobs: unknown[]): TurnResult["debug"] {
  const out: TurnResult["debug"] = [];
  for (const blob of debugBlobs) {
    if (!Array.isArray(blob)) continue;
    for (const entry of blob) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { type?: string; tool?: string; preview?: unknown };
      if (e.type !== "tool_result") continue;
      const p = (e.preview ?? {}) as SunsetDebugPreview;
      if (Array.isArray(p.available_accommodations) || Array.isArray(p.gallery_photos)) {
        out.push({ tool: e.tool || "unknown", preview: p });
      }
    }
  }
  return out;
}

async function runTurn(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  timeoutMs: number
): Promise<TurnResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(CHAT_LOCAL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NEXUS_SERVICE_ROLE_KEY
          ? { "x-nexus-auth": `Bearer ${process.env.NEXUS_SERVICE_ROLE_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        agent_id: agentId,
        messages,
        conversation_id: null,
        skip_history_persist: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const raw = await resp.text();
    if (!resp.ok) {
      return { assistantText: "", debug: [], error: `HTTP ${resp.status}: ${raw.slice(0, 400)}` };
    }
    const { content, debugBlobs } = parseSseStream(raw);
    const debug = extractSunsetToolResults(debugBlobs);
    return { assistantText: content.trim(), debug };
  } catch (e: unknown) {
    clearTimeout(timer);
    const err = e as Error;
    return {
      assistantText: "",
      debug: [],
      error: err?.name === "AbortError" ? "timeout" : err?.message || String(e),
    };
  }
}

async function resolveSunsetAgentId(): Promise<string | null> {
  const envId = process.env.SUNSET_E2E_AGENT_ID?.trim();
  if (envId) return envId;
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug")
    .in("slug", ["sunset-thermas-park", "sunset-thermas"]);
  const ids = (tenants || []).map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return null;
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .in("tenant_id", ids)
    .limit(5);
  return agents?.[0]?.id ?? null;
}

const IMAGE_MD_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;
const PRICE_LINE_RE = /\*[^*]+\*\s*[—–-]\s*R\$\s*[\d.,]+/;

function isLodgingQuoteImageWithPriceBlock(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  if (!IMAGE_MD_RE.test(lines[0])) return false;
  return PRICE_LINE_RE.test(lines[1]);
}

/** Mesma heurística do delivery.ts: foto+preço num único bloco, mesmo com `\n\n` no meio. */
function tryJoinImageWithAdjacentPrice(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length < 3) return text;
  const out: string[] = [];
  let i = 0;
  let touched = false;
  while (i < lines.length) {
    const cur = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    const after = (lines[i + 2] ?? "").trim();
    if (
      !touched &&
      cur &&
      IMAGE_MD_RE.test(cur) &&
      next === "" &&
      PRICE_LINE_RE.test(after)
    ) {
      out.push(cur);
      out.push(after);
      i += 3;
      touched = true;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return touched ? out.join("\n") : text;
}

function expandDeliveryParts(rawParts: string[]): string[] {
  return rawParts.flatMap((p) => {
    const trimmed = tryJoinImageWithAdjacentPrice(p.trim()).trim();
    if (!trimmed) return [];
    if (isLodgingQuoteImageWithPriceBlock(trimmed)) return [trimmed];
    return trimmed
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  });
}

function assertQuoteLayout(
  text: string,
  toolResults: TurnResult["debug"]
): string[] {
  const failures: string[] = [];

  const hasPrice = /R\$\s*[\d.]+/.test(text);
  if (!hasPrice) {
    failures.push(
      "Resposta do assistente não contém preço em R$ (orçamento não veio ou fluxo incompleto)."
    );
    return failures;
  }

  const lodgingTool = toolResults.find((t) =>
    Array.isArray(t.preview.available_accommodations) ||
    Array.isArray(t.preview.gallery_photos)
  );
  if (!lodgingTool) {
    failures.push(
      "Nenhum tool_result de hospedagem (available_accommodations / gallery_photos) capturado — pipeline do formatter não tem dados."
    );
    return failures;
  }

  const accs = lodgingTool.preview.available_accommodations ?? [];
  const photos = lodgingTool.preview.gallery_photos ?? [];
  console.log(`\n[Sunset diag] tool: ${lodgingTool.tool}`);
  console.log(`[Sunset diag] accommodations: ${accs.length} → ${accs.map((a) => a.name).join(", ")}`);
  console.log(`[Sunset diag] gallery_photos: ${photos.length}`);
  console.log(`[Sunset diag] resposta (trecho):\n${text.slice(0, 600)}${text.length > 600 ? "…" : ""}`);

  const parts = text.includes("<<MSG_SPLIT>>")
    ? text.split("<<MSG_SPLIT>>")
    : [text];

  const lodgingBlocks = parts.filter((p) => isLodgingQuoteImageWithPriceBlock(p));
  if (lodgingBlocks.length === 0) {
    failures.push(
      "Nenhum bloco `![foto](url)\\n*R$*` (pares foto+preço) na resposta — formatter não agrupou como esperado."
    );
    return failures;
  }

  if (accs.length >= 2 && lodgingBlocks.length < accs.length) {
    failures.push(
      `Esperado ao menos ${accs.length} blocos foto+preço (um por acomodação), mas só ${lodgingBlocks.length} encontrado(s).`
    );
  }

  // Confirma que cada bloco, mesmo com `\n\n` no meio, é entregue ao delivery como UMA parte.
  const expanded = expandDeliveryParts(lodgingBlocks);
  const splitBack = expanded.flatMap((b) =>
    b.includes("\n\n") ? b.split(/\n\s*\n/).filter(Boolean) : [b]
  );
  if (splitBack.length > lodgingBlocks.length) {
    failures.push(
      `Bloco foto+preço quebrou após split por parágrafo: ${lodgingBlocks.length} bloco(s) viraram ${splitBack.length}. Faltou a junção na entrega.`
    );
  }

  return failures;
}

async function pingServer(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE.replace(/\/api$/, "")}/health`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log("\n=== E2E Sunset Thermas — orçamento (foto+preço no mesmo balão) ===\n");
  console.log("CHAT_LOCAL:", CHAT_LOCAL);

  const agentId = await resolveSunsetAgentId();
  if (!agentId) {
    console.error(
      "Falha: defina SUNSET_E2E_AGENT_ID ou NEXUS_DB_URL + chave com tenant sunset-thermas-park."
    );
    process.exit(1);
  }
  console.log("Agente:", agentId.slice(0, 8) + "…");

  const up = await pingServer();
  if (!up) console.warn("Aviso: não consegui ping no servidor — tentando mesmo assim.");

  const today = new Date();
  const checkIn = new Date(today.getTime() + 14 * 24 * 3600 * 1000);
  const checkOut = new Date(today.getTime() + 15 * 24 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "user",
      content: `Oi! Pode me chamar de Gabi. Quero orçamento para hospedagem: entrada ${fmt(checkIn)}, saída ${fmt(checkOut)}, 2 adultos. Pode mandar as opções?`,
    },
  ];

  console.log("\n— Turno 1 (pedido de orçamento Sunset) —\n");
  const timeoutMs = 180000;
  let turn = await runTurn(agentId, messages, timeoutMs);
  if (turn.error) {
    console.error("Erro turno 1:", turn.error);
    process.exit(1);
  }

  let finalText = turn.assistantText;
  let finalDebug = turn.debug;

  if (!/R\$\s*[\d.,]+/.test(finalText)) {
    messages.push({ role: "assistant", content: finalText });
    messages.push({
      role: "user",
      content: `Confirma datas ${fmt(checkIn)} a ${fmt(checkOut)} para 2 adultos e manda os valores.`,
    });
    console.log("\n— Turno 2 (reforço de datas/ocupação) —\n");
    turn = await runTurn(agentId, messages, timeoutMs);
    if (turn.error) {
      console.error("Erro turno 2:", turn.error);
      process.exit(1);
    }
    finalText = turn.assistantText;
    finalDebug = [...finalDebug, ...turn.debug];
  }

  const failures = assertQuoteLayout(finalText, finalDebug);
  if (failures.length > 0) {
    console.error("\n✗ Falhas na entrega do orçamento Sunset:");
    for (const f of failures) console.error("  -", f);
    console.error("\n--- Texto completo do assistente ---\n", finalText);
    process.exit(1);
  }

  console.log(
    "\n✓ E2E Sunset orçamento: foto+preço vieram agrupados, prontos para caption no WhatsApp (validar visualmente após deploy)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
