/**
 * Utilitários para follow-up: detecção de "vou pensar" e delay D+2.
 */

/** Padrões que indicam que o cliente vai pensar/analisar antes de decidir */
const THINKING_PATTERNS = [
  /\bvou\s+pensar\b/i,
  /\bpreciso\s+pensar\b/i,
  /\bdeixa\s+eu\s+ver\b/i,
  /\bdeixa\s+eu\s+analisar\b/i,
  /\bvou\s+analisar\b/i,
  /\bme\s+d[aá]\s+uns?\s+dias?\b/i,
  /\bpreciso\s+de\s+um\s+tempo\b/i,
  /\bvou\s+ver\s+com\s+(a|o)\b/i,
  /\bdepois\s+te\s+falo\b/i,
  /\bte\s+aviso\b/i,
  /\bvou\s+ver\b/i,
  /\bdeixa\s+eu\s+pensar\b/i,
  /\bpreciso\s+pensar\s+melhor\b/i,
  /\bnao\s+sei\s+ainda\b/i,
  /\bn[aã]o\s+sei\s+ainda\b/i,
  /\bpreciso\s+conversar\s+com\s+(a|o)\b/i,
  /\bvou\s+conversar\s+com\s+(a|o)\b/i,
];

/** Delay padrão para "vou pensar" em minutos (48h = D+2) */
export const DEFAULT_THINKING_DELAY_MINUTES = 48 * 60; // 2880

/**
 * Verifica se o conteúdo indica que o cliente vai pensar/analisar antes de decidir.
 * Usado para agendar follow-up em D+2 em vez de 10/20/30 min.
 */
export function isThinkingAboutIt(content: string | null | undefined): boolean {
  const text = (content || "").trim();
  if (!text || text.length < 5) return false;
  return THINKING_PATTERNS.some((p) => p.test(text));
}

/**
 * Retorna o delay em minutos para follow-up quando cliente disse que vai pensar.
 * Usa o valor configurado no agent ou o padrão (2880 = 48h).
 */
export function getThinkingDelayMinutes(cfg: Record<string, unknown>): number {
  const v = cfg.followup_thinking_delay_minutes;
  if (v != null && typeof v === "number" && v > 0) return Math.round(v);
  return DEFAULT_THINKING_DELAY_MINUTES;
}
