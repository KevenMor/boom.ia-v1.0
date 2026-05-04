/**
 * Guard de follow-up: classifica se deve enviar ou pular por contexto negativo.
 * Usa LLM para análise do histórico antes de gerar a mensagem de follow-up.
 */

const GUARD_PROMPT = `[SISTEMA INTERNO - FOLLOW-UP GUARD]

Analise o histórico desta conversa. O cliente deixou claro que NÃO quer prosseguir, já fechou com outro, ou o contexto é negativo?

Responda APENAS com uma destas palavras:
- SEND = pode enviar follow-up (cliente ainda em consideração)
- SKIP = não enviar (cliente rejeitou, desistiu, fechou com outro, ou contexto negativo)`;

export type GuardResult = "send" | "skip";

/**
 * Chama o LLM para classificar se deve enviar follow-up ou pular por contexto negativo.
 * Retorna "skip" se a resposta contiver SKIP; "send" caso contrário.
 * Em caso de erro, retorna "send" (fail-open: não bloquear follow-ups por falha do guard).
 */
export async function shouldSkipFollowUpByContext(
  callChatAgent: (
    baseUrl: string,
    nexusKey: string,
    agentId: string,
    messages: { role: string; content: string }[],
    convId: string | null,
    attachments?: any[],
    externalUserId?: string | null,
    chatwootConvId?: number | null,
    chatOpts?: { followup_generation?: boolean }
  ) => Promise<{ error: string | null; fullContent: string }>,
  baseUrl: string,
  nexusKey: string,
  agentId: string,
  conversationMessages: { role: string; content: string }[],
  conversationId: string | null,
  externalUserId: string | null,
  chatwootConvId: number | null
): Promise<GuardResult> {
  try {
    // Janela ampla para o guard avaliar: em conversas longas, evidências de "cliente desistiu",
    // "já comprou" ou "não tem interesse" podem estar em mensagens antigas. 30 era apertado
    // demais e fazia o guard mandar follow-up duplicado / inadequado em conversas extensas.
    const FOLLOWUP_GUARD_HISTORY_LIMIT = (() => {
      const raw = process.env.FOLLOWUP_GUARD_HISTORY_LIMIT;
      if (!raw) return 100;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 10) return 100;
      return Math.min(Math.round(n), 500);
    })();
    const messages = [
      ...conversationMessages.slice(-FOLLOWUP_GUARD_HISTORY_LIMIT),
      { role: "user" as const, content: GUARD_PROMPT },
    ];
    const result = await callChatAgent(
      baseUrl,
      nexusKey,
      agentId,
      messages,
      conversationId,
      undefined,
      externalUserId,
      chatwootConvId
    );
    if (result.error) {
      console.warn("[FollowUp] Guard LLM error (fail-open):", result.error.slice(0, 100));
      return "send";
    }
    const content = (result.fullContent || "").trim().toUpperCase();
    if (/\bSKIP\b/.test(content)) return "skip";
    return "send";
  } catch (e) {
    console.warn("[FollowUp] Guard exception (fail-open):", (e as Error)?.message);
    return "send";
  }
}
