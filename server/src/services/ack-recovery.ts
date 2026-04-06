import { pickSoftReply } from "../constants/assistant-soft-replies.js";
import { sanitizeLLMOutput } from "../utils/sanitize.js";

const ACK_WORDS = new Set([
  "ok",
  "okay",
  "ta",
  "tá",
  "sim",
  "certo",
  "beleza",
  "blz",
  "isso",
  "fechou",
  "perfeito",
  "show",
  "vlw",
  "valeu",
  "obrigado",
  "obrigada",
  "obg",
  "manda",
  "uhum",
  "ahn",
  "aham",
  "combinado",
  "entendi",
  "ta bom",
  "tá bom",
  "tabom",
  "por favor",
  "porfavor",
  "claro",
]);

/** Confirmação curta típica (resposta ao assistente anterior). */
export function isShortAcknowledgment(text: string | null | undefined): boolean {
  const raw = (text || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw || raw.length > 48) return false;
  if (ACK_WORDS.has(raw)) return true;
  if (/^(ok|sim|certo|ta|tá|isso)\s*[!\.]*$/i.test(raw)) return true;
  if (/^(beleza|fechou|perfeito|combinado|entendi)\s*[!\.]*$/i.test(raw)) return true;
  return false;
}

export function findLastAssistantContent(
  messages: Array<{ role: string; content: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const c = (messages[i].content || "").trim();
      if (c.length >= 15) return c.slice(0, 2800);
    }
  }
  return null;
}

export async function fetchAckRecoveryReply(opts: {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  lastAssistantText: string;
  userAck: string;
}): Promise<string | null> {
  const system = [
    "Você é o atendente que estava falando com o cliente no WhatsApp.",
    "Responda em português do Brasil, 1 a 2 frases curtas, tom humano e profissional.",
    "Não mencione falhas técnicas, API, sistema, IA ou robô.",
    "O cliente só confirmou de forma breve; continue o atendimento de forma natural (agradecer, confirmar próximo passo ou fechar com cordialidade), alinhado ao que você havia dito antes.",
  ].join(" ");

  const user = [
    "Sua mensagem anterior ao cliente foi:",
    '"""',
    opts.lastAssistantText,
    '"""',
    "",
    `O cliente respondeu apenas: "${opts.userAck}"`,
    "Gere a próxima mensagem sua para o cliente.",
  ].join("\n");

  const body = {
    model: opts.model,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    stream: false,
    max_tokens: 180,
    temperature: opts.temperature ?? 0.45,
  };

  try {
    const resp = await fetch(opts.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      console.warn("[AckRecovery] LLM error:", resp.status, err.slice(0, 120));
      return null;
    }
    const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const sanitized = sanitizeLLMOutput(content);
    return sanitized || null;
  } catch (e) {
    console.warn("[AckRecovery] fetch failed:", (e as Error)?.message);
    return null;
  }
}

export async function resolveAssistantFallbackMessage(opts: {
  seed: string;
  lastUserText: string | null | undefined;
  historyMessages: Array<{ role: string; content: string }>;
  convApiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
}): Promise<string> {
  const soft = pickSoftReply(opts.seed);
  const userAck = (opts.lastUserText || "").trim();
  if (!isShortAcknowledgment(userAck)) return soft;

  const lastAsst = findLastAssistantContent(opts.historyMessages);
  if (!lastAsst) return soft;

  const recovered = await fetchAckRecoveryReply({
    apiUrl: opts.convApiUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    temperature: opts.temperature,
    lastAssistantText: lastAsst,
    userAck,
  });
  if (recovered) return recovered;
  return soft;
}
