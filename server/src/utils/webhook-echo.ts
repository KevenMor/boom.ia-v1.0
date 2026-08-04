/**
 * Heurísticas de eco (WhatsApp/Chatwoot às vezes devolve a fala do bot como incoming).
 * Mensagens sincronizadas de atendentes humanos NÃO contam como eco do bot.
 */

export function normalizeWebhookContent(value: string): string {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isAssistantMessageFromHumanAgent(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const m = metadata as Record<string, unknown>;
  return m.source === "chatwoot_human";
}

/**
 * Eco real: strings quase idênticas. Citação curta do cliente NÃO é eco.
 */
export function isLikelyEchoContent(incoming: string, assistant: string): boolean {
  if (incoming === assistant) return true;
  const a = incoming.length;
  const b = assistant.length;
  if (a < 10 || b < 10) return false;
  const ratio = Math.min(a, b) / Math.max(a, b);
  if (ratio < 0.85) return false;
  const shorter = a <= b ? incoming : assistant;
  const longer = a <= b ? assistant : incoming;
  return longer.includes(shorter);
}

export type EchoHistoryMessage = {
  role?: string;
  content?: string;
  created_at?: string;
  metadata?: unknown;
};

/**
 * True se o incoming parece eco de mensagem da IA (não de humano no Chatwoot).
 */
export function isLikelyEchoAgainstHistory(
  incomingText: string,
  history: EchoHistoryMessage[],
  windowSeconds = 180,
  nowMs = Date.now(),
): boolean {
  const normalizedIncoming = normalizeWebhookContent(incomingText);
  if (!normalizedIncoming || history.length === 0) return false;

  let checked = 0;
  for (let i = history.length - 1; i >= 0 && checked < 10; i--) {
    const m = history[i];
    if (m.role !== "assistant") continue;
    if (isAssistantMessageFromHumanAgent(m.metadata)) continue;
    checked++;
    const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
    if (!createdAt || nowMs - createdAt > windowSeconds * 1000) continue;
    const norm = normalizeWebhookContent(String(m.content || ""));
    if (!norm) continue;
    if (norm === normalizedIncoming || isLikelyEchoContent(normalizedIncoming, norm)) {
      return true;
    }
  }
  return false;
}
