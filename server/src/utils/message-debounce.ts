/**
 * Consolida mensagens "picadas" do cliente em um único texto para a LLM.
 * Fragmentos curtos em sequência (ex.: "pode me mandar as foto amanha" + "amanda")
 * são unidos com espaço para preservar contexto de correção/autocompletar.
 */
export function consolidateBufferedUserMessages(messages: string[]): string {
  const parts = messages.map((m) => m.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  const allShortFragments = parts.every((p) => p.length <= 120 && !p.includes("\n"));
  if (allShortFragments) {
    return parts.join(" ");
  }

  return parts.join("\n\n");
}

export function buildConsolidatedUserMessageForLlm(messages: string[]): string {
  const consolidated = consolidateBufferedUserMessages(messages);
  if (messages.filter((m) => m.trim()).length <= 1) return consolidated;

  return `[Cliente enviou ${messages.length} mensagens seguidas — interprete em conjunto, incluindo correções de digitação na mensagem seguinte]\n\n${consolidated}`;
}

export const MESSAGE_DEBOUNCE_QUIET_TAIL_MS = 800;
export const MESSAGE_DEBOUNCE_QUIET_POLL_MS = 400;
