/**
 * Utilitários compartilhados entre Chat ao Vivo e pré-visualização em Contatos.
 * Mantém o mesmo filtro e saneamento para “espelhar” a conversa.
 */

export function stripChatwootHeader(content: string): string {
  return content.replace(/^\[Atendente:[^\]]*\]\s*[^:]*:\s*/gm, "").trim();
}

/** Remove vazamentos comuns de tools / prompts internos no texto do assistente */
export function sanitizeAssistantContent(content: string): string {
  if (!content) return content;
  let text = content
    .replace(/\*\*?tool_code[\s\S]*?\)\s*\)\*\*?/gim, "")
    .replace(/tool_code[\s\S]*?\)\s*\)(?=\s|$|\.|,|;)/gim, "")
    .replace(/\b(assign_agent|atribuir_agente|chatwoot_assign)\s*\(\s*[^)]*\)/gim, "")
    .replace(/\bprint\s*\(\s*(?:json\.dumps\s*)?\([^)]*assign_agent[^)]*\)\s*\)/gim, "")
    .replace(/\[\s*CHAMAR\s+FERRAMENTA[^\]]*\]/gim, "")
    .replace(/\bNO_TOOLS_NEEDED\b/gim, "")
    .replace(/^\s*\[SISTEMA\s+INTERNO\s*[-—]\s*FOLLOW-UP\s+GUARD\]\s*$/gim, "")
    .replace(/^.*Responda\s+APENAS\s+com\s+uma\s+destas\s+palavras:.*$/gim, "")
    .replace(/^\s*[-•]?\s*SEND\s*=\s*.*$/gim, "")
    .replace(/^\s*[-•]?\s*SKIP\s*=\s*.*$/gim, "")
    .replace(/^.*Analise\s+o\s+hist[óo]rico\s+desta\s+conversa\..*$/gim, "")
    .replace(/^.*O\s+cliente\s+deixou\s+claro\s+que\s+N[ÃA]O\s+quer\s+prosseguir.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/^\s*(SEND|SKIP)\s*$/im.test(text)) return "";
  // Qualquer trecho a partir de marcador interno (ex.: follow-up automático vazado no assistente)
  text = text.replace(/\[SISTEMA\s+INTERNO[\s\S]*/gi, "").trim();
  return text;
}

export function deduplicateRepeatedContent(text: string): string {
  const t = text.trim();
  if (t.length < 60) return t;
  const len = t.length;
  const half = Math.floor(len / 2);
  const first = t.slice(0, half).trim();
  const second = t.slice(half).trim();
  if (first.length > 30 && first === second) return first;
  const third = Math.floor(len / 3);
  const unit = t.slice(0, third).trim();
  if (unit.length > 20) {
    const r2 = t.slice(third, 2 * third).trim();
    const r3 = t.slice(2 * third).trim();
    if (unit === r2 && unit === r3) return unit;
  }
  return t;
}

export function extractImages(content: string): { text: string; images: string[] } {
  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const images: string[] = [];
  const text = stripChatwootHeader(content).replace(imgRegex, (_, _alt, url) => {
    images.push(url);
    return "";
  }).trim();
  return { text, images };
}

export function parseAudioTranscription(content: string): {
  isAudio: boolean;
  transcription: string;
  remainingText: string;
} {
  const audioRegex = /\[Áudio do cliente\s*-?\s*transcrição\]:\s*"([^"]*)"/i;
  const match = content.match(audioRegex);
  if (match) {
    const transcription = match[1] || "";
    const remainingText = content.replace(audioRegex, "").trim();
    return { isAudio: true, transcription, remainingText };
  }
  return { isAudio: false, transcription: "", remainingText: content };
}

/** Mesma regra do Chat ao Vivo: oculta prompts internos e tool JSON salvo como user/system */
export function shouldShowChatMessage(
  msg: { role: string; content?: string | null },
  showDebug: boolean
): boolean {
  const content = msg.content || "";
  const trimmed = content.trim();

  if (msg.role === "user") {
    if (/\[SISTEMA\s+INTERNO/i.test(trimmed)) return false;
    if (trimmed.startsWith("{") && (content.includes('"_hint"') || content.includes('"vehicles"') || content.includes('"total"')))
      return false;
    if (trimmed.startsWith("{") && content.includes('"tool_results"')) return false;
  }

  if ((msg.role === "tool" || msg.role === "system") && !showDebug) {
    const c = trimmed;
    if (c.startsWith("{") || c.startsWith("[")) return false;
    if (c.startsWith("[Resultado da ferramenta")) return false;
    if (c.startsWith("⚠️")) return false;
  }

  return true;
}

const DEDUPE_TIME_BUCKET_MS = 5000;

/**
 * Ordena por created_at e remove duplicatas (mesmo id ou mesmo role+conteúdo no mesmo bucket de tempo),
 * alinhado ao merge do Chat ao Vivo (`useMultiConversationMessages`).
 */
export function dedupeAndSortConversationMessages<
  T extends { id: string; role: string; content: string; created_at: string },
>(messages: T[]): T[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const seenIds = new Set<string>();
  const seenContentKeys = new Set<string>();
  const out: T[] = [];
  for (const m of sorted) {
    const t = Math.floor(new Date(m.created_at).getTime() / DEDUPE_TIME_BUCKET_MS);
    const ck = `${m.role}\t${(m.content || "").trim()}\t${t}`;
    if (seenIds.has(m.id)) continue;
    if (seenContentKeys.has(ck)) continue;
    seenIds.add(m.id);
    seenContentKeys.add(ck);
    out.push(m);
  }
  return out;
}
