/**
 * E2E — Orçamento Vale Suíço (chat-local + Omnibees).
 * Valida: múltiplas acomodações quando roomCount > 1, pensão + horários proativos,
 * parcelado quando existir no summaryText, frases proibidas de "quer saber sobre pensão".
 *
 * Requer: server rodando (npm run dev na pasta server ou dev:all), .env com NEXUS_DB_URL + chave,
 * agente Vale com tool consultar_disponibilidade_vale_suico e providers configurados.
 *
 * Uso: cd server && npx tsx scripts/e2e-vale-suico-orcamento.ts
 * Opcional: VALE_E2E_AGENT_ID=uuid npx tsx scripts/e2e-vale-suico-orcamento.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { extractVideoUrlsFromText } from "../src/services/delivery.js";

const BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const CHAT_LOCAL = `${BASE}/api/chat-local`;

interface OmnibeesPreview {
  roomCount?: number;
  summaryText?: string;
  rooms?: Array<{ roomName?: string }>;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

interface TurnResult {
  assistantText: string;
  omnibees: OmnibeesPreview | null;
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

function extractLastOmnibeesFromDebug(debugBlobs: unknown[]): OmnibeesPreview | null {
  let last: OmnibeesPreview | null = null;
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
          checkInTime: (p.checkInTime as string | null | undefined) ?? null,
          checkOutTime: (p.checkOutTime as string | null | undefined) ?? null,
        };
      }
    }
  }
  return last;
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
      return { assistantText: "", omnibees: null, error: `HTTP ${resp.status}: ${raw.slice(0, 400)}` };
    }
    const { content, debugBlobs } = parseSseStream(raw);
    const omnibees = extractLastOmnibeesFromDebug(debugBlobs);
    return { assistantText: content.trim(), omnibees };
  } catch (e: unknown) {
    clearTimeout(timer);
    const err = e as Error;
    return { assistantText: "", omnibees: null, error: err?.name === "AbortError" ? "timeout" : err?.message || String(e) };
  }
}

async function resolveValeAgentId(): Promise<string | null> {
  const envId = process.env.VALE_E2E_AGENT_ID?.trim();
  if (envId) return envId;
  const url = process.env.NEXUS_DB_URL;
  const key = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data: tenants } = await supabase.from("tenants").select("id, slug").in("slug", ["vale-suico", "vale-suico-resort"]);
  const ids = (tenants || []).map((t) => t.id).filter(Boolean);
  if (ids.length === 0) return null;
  const { data: agents } = await supabase.from("agents").select("id, name").in("tenant_id", ids).limit(5);
  return agents?.[0]?.id ?? null;
}

function assertQuoteQuality(text: string, omni: OmnibeesPreview | null): string[] {
  const failures: string[] = [];
  const hasPrice = /R\$\s*[\d.]+/.test(text);
  if (!hasPrice) {
    failures.push("Resposta do assistente não contém preço em R$ (orçamento não veio ou fluxo incompleto).");
    return failures;
  }

  // Mesma lógica que o envio ao Chatwoot: URL só-URL em linha própria vira anexo; não deve sobrar na bolha de texto.
  const { textOnly: textAsClientSees } = extractVideoUrlsFromText(text);
  if (/https?:\/\/[^\s]+\.(?:mp4|webm|mov)\b/i.test(textAsClientSees)) {
    failures.push(
      "Após separar mídia (como no delivery), ainda há URL de vídeo no texto — use linha só-URL ou evite URL no meio da frase."
    );
  }

  const t = text.toLowerCase();
  if (!/pens[aã]o/.test(t)) {
    failures.push("Esperado menção ao regime (Pensão Completa / pensão) na mesma entrega do orçamento.");
  }

  if (/\bgostaria de saber sobre\b/i.test(text) && /pens[aã]o|regime/i.test(text)) {
    failures.push('Proibido: "gostaria de saber sobre" pensão/regime em vez de informar direto.');
  }
  if (/\bquer saber sobre\b/i.test(text) && /pens[aã]o|regime/i.test(text)) {
    failures.push('Proibido: "quer saber sobre" pensão/regime.');
  }
  if (/\btem alguma d[uú]vida sobre a estadia\b/i.test(text)) {
    failures.push('Proibido: "tem alguma dúvida sobre a estadia" como fecho preguiçoso (informe pensão/horários no corpo).');
  }

  const st = omni?.summaryText || "";
  const hasInstallmentInTool = /Opção parcelada no cartão/i.test(st);
  if (hasInstallmentInTool && !/parcelad|cart[aã]o/i.test(t)) {
    failures.push('O retorno Omnibees tinha "Opção parcelada no cartão" mas o texto não menciona parcelado/cartão.');
  }

  const expectsTimes =
    /Horários nesta página|check-in a partir|check-out até/i.test(st) ||
    Boolean(omni?.checkInTime && omni?.checkOutTime);
  if (expectsTimes) {
    const hasTimeMention =
      /check\s*[-–]?\s*in|check\s*[-–]?\s*out|entrada|sa[ií]da|\d{1,2}\s*h\b/i.test(text);
    if (!hasTimeMention) {
      failures.push("Retorno continha horários Omnibees mas o assistente não citou check-in/check-out (ou horas).");
    }
  }

  const roomCount = omni?.roomCount ?? (Array.isArray(omni?.rooms) ? omni!.rooms!.length : 0);
  const names = (omni?.rooms || [])
    .map((r) => (r.roomName || "").trim())
    .filter(Boolean);

  if (roomCount > 1 && names.length > 1) {
    let mentioned = 0;
    for (const n of names) {
      const short = n.split(/[\s(]/)[0];
      if (short.length >= 3 && text.toLowerCase().includes(n.toLowerCase())) mentioned++;
      else if (short.length >= 3 && text.toLowerCase().includes(short.toLowerCase())) mentioned++;
    }
    if (mentioned < Math.min(roomCount, names.length)) {
      failures.push(
        `roomCount=${roomCount} (${names.join(", ")}) mas o texto parece não citar todas as acomodações (citadas ~${mentioned}).`
      );
    }
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
  console.log("\n=== E2E Vale Suíço — orçamento completo ===\n");
  console.log("CHAT_LOCAL:", CHAT_LOCAL);

  const agentId = await resolveValeAgentId();
  if (!agentId) {
    console.error("Falha: defina VALE_E2E_AGENT_ID ou NEXUS_DB_URL + chave com tenant vale-suico.");
    process.exit(1);
  }
  console.log("Agente:", agentId.slice(0, 8) + "…");

  const up = await pingServer();
  if (!up) console.warn("Aviso: não consegui ping no servidor — tentando mesmo assim.");

  const timeoutTurn1 = 90000;
  const timeoutTurn2 = 180000;

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "user",
      content:
        "Oi! Pode me chamar de Gabi. É nossa primeira vez no Vale Suíço. Quero orçamento: entrada 12/06, saída 14/06, 2 adultos e 1 criança de 3 anos.",
    },
  ];

  console.log("\n— Turno 1 (qualificação + pedido de orçamento) —\n");
  let turn = await runTurn(agentId, messages, timeoutTurn1);
  if (turn.error) {
    console.error("Erro turno 1:", turn.error);
    process.exit(1);
  }
  console.log("Assistente (trecho):", turn.assistantText.slice(0, 500) + (turn.assistantText.length > 500 ? "…" : ""));
  if (turn.assistantText) {
    messages.push({ role: "assistant", content: turn.assistantText });
  }

  const firstHasPrice = /R\$\s*[\d.]+/.test(turn.assistantText);
  let finalText = turn.assistantText;
  let finalOmni = turn.omnibees;

  if (!firstHasPrice) {
    messages.push({
      role: "user",
      content: "Isso mesmo: 12 a 14 de junho, 2 adultos e 1 criança de 3 anos. Pode mandar os valores.",
    });
    console.log("\n— Turno 2 (reforço de datas/ocupação) —\n");
    turn = await runTurn(agentId, messages, timeoutTurn2);
    if (turn.error) {
      console.error("Erro turno 2:", turn.error);
      process.exit(1);
    }
    console.log("Assistente (trecho):", turn.assistantText.slice(0, 800) + (turn.assistantText.length > 800 ? "…" : ""));
    finalText = turn.assistantText;
    finalOmni = turn.omnibees ?? finalOmni;
  }

  if (finalOmni) {
    console.log("\n[Omnibees debug] roomCount:", finalOmni.roomCount, "| rooms:", finalOmni.rooms?.map((r) => r.roomName));
    if (finalOmni.summaryText) {
      console.log("[summaryText trecho]\n", finalOmni.summaryText.slice(0, 600) + "…\n");
    }
  } else {
    console.warn("\n[Omnibees] Nenhum tool_result capturado no stream — a consulta pode não ter rodado ou o modelo não disparou a tool.");
  }

  const failures = assertQuoteQuality(finalText, finalOmni);
  if (failures.length > 0) {
    console.error("\n✗ Falhas na qualidade do orçamento:");
    for (const f of failures) console.error("  -", f);
    console.error("\n--- Texto completo do assistente ---\n", finalText);
    process.exit(1);
  }

  console.log("\n✓ E2E orçamento: checagens de prompt passaram (pensão, anti-pergunta passiva, parcelado se houver, múltiplas suítes se roomCount>1, horários se vierem na tool).");
  console.log("\nObs.: valide manualmente no WhatsApp/Chatwoot após deploy (tom, vídeo institucional, <<MSG_SPLIT>>).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
