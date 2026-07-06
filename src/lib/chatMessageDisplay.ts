/**
 * Utilitários compartilhados entre Chat ao Vivo e pré-visualização em Contatos.
 * Mantém o mesmo filtro e saneamento para “espelhar” a conversa.
 * (Alinhado a server/src/utils/sanitize.ts — stripThought / stripToolNameLeakage)
 */

/** Remove THOUGHT / reasoning em inglês até linha que parece resposta em PT-BR */
export function stripThoughtAndReasoningBlocks(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skippingThought = false;

  const isThoughtHeader = (l: string) => {
    const t = l.trim();
    return (
      /^\*{0,2}\s*THOUGHT\s*\*{0,2}\s*:?\s*$/i.test(t) ||
      /^\*{0,2}\s*THOUGHT\s*\*{0,2}\s+\S/i.test(t) ||
      /^\s*THOUGHT\s*:?\s*$/i.test(t) ||
      /^\s*THOUGHT\s+\S/i.test(t)
    );
  };
  const looksLikePortugueseReplyLine = (l: string) => {
    const s = l.trim();
    if (!s) return false;
    if (/[áãâéêíóôõúçÁÃÂÉÊÍÓÔÕÚÇ]/.test(s)) return true;
    return /\b(ol[áa]|oi[!,.]?|^oi$|você|obrigad|obrigado|obrigada|não|sim[,!]|certo[!,.]?|perfeito|fico\s+aguardando|pode\s+ser|qual\s|quando\s|onde\s|temos|disponível|horário|agendamento|consulta|valor|preço|reais|r\$)\b/i.test(s);
  };
  const looksLikeEnglishReasoningLine = (l: string) => {
    const s = l.trim();
    if (!s) return false;
    return (
      /^(I need to|It's important|My previous|This is|Acknowledge|Clarify|Reiterate|However|Therefore|Note that)\b/i.test(s) ||
      /^\s*[-•*]\s+(Acknowledge|Clarify|Wait|No question)/i.test(s) ||
      /^\s*The user (?:is|has|was|provided|asked|wants|said|tells?|just|will|can)\b/i.test(s)
    );
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (isThoughtHeader(trimmedLine)) {
      skippingThought = true;
      continue;
    }
    if (skippingThought) {
      if (trimmedLine === "") continue;
      if (looksLikePortugueseReplyLine(line)) {
        skippingThought = false;
        out.push(line);
        continue;
      }
      if (looksLikeEnglishReasoningLine(line)) continue;
      if (/^\s*[-•*]\s/.test(line) && !looksLikePortugueseReplyLine(line)) continue;
      if (/^\s*I need to:\s*$/i.test(trimmedLine)) continue;
      if (
        trimmedLine.length > 0 &&
        !/[áãâéêíóôõúç]/.test(line) &&
        /^[A-Z]/.test(trimmedLine) &&
        trimmedLine.length > 35
      ) {
        continue;
      }
      continue;
    }
    out.push(line);
  }

  let result = out.join("\n");
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, "");
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  result = result.replace(/```(?:thinking|reasoning)\s*[\s\S]*?```/gi, "");
  result = result.replace(/(?:^|\n)\s*THOUGHT\s*:?\s*\n[\s\S]*?(?=\n\n[^\n]*[áãâéêíóôõúç])/gi, "\n\n");
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripToolNameLeakageForDisplay(content: string): string {
  let t = content;
  t = t.replace(/\bmarcar_lead\s*\([^)]*\)/gim, "");
  t = t.replace(/\bmarcar_lead\b/gi, "");
  t = t.replace(/\bMARCAR\s+LEAD\b[^\n\r]*/gim, "");
  t = t.replace(/\[ETIQUETAGEM\s+DE\s+LEAD[^\]]*\]/gim, "");
  t = t.replace(/\[CHAMAR\s+FERRAMENTA[^\]]*marcar_lead[^\]]*\]/gim, "");
  t = t.replace(/^\s*marcar_lead\s*$/gim, "");
  t = t.replace(/\n\s*marca[r]?\s*lead\s*:?\s*[^\n]*/gi, "");
  t = t.replace(/\[CONTEXTO\s+ADICIONAL\][\s\S]*?(?=\n\n[^\[]|\n\n\[|$)/gim, "");
  t = t.replace(/\[NOVO\s+LEAD\s+DETECTADO[^\]]*\]/gim, "");
  t = t.replace(/\[HINT\s+OBRIGAT[ÓO]RIO\][^\n]*/gim, "");
  t = t.replace(/\[RESUMO\s+CONFIRMADO\][\s\S]*?(?=\n\n|$)/gim, "");
  t = t.replace(/\[ALUNO\s+EXISTENTE\][^\n]*/gim, "");
  t = t.replace(/\[CEP\s+DETECTADO[^\]]*\]/gim, "");
  t = t.replace(/\[ENTIDADES\s+DETECTADAS[^\]]*\]/gim, "");
  t = t.replace(/\[CONTEXTO\s+DE\s+FLUXO\][^\n]*/gim, "");
  t = t.replace(/\b(consultar_unidade|nearest_unit)\s*\(\s*[^)]*\)/gim, "");
  return t;
}

export function stripChatwootHeader(content: string): string {
  return content.replace(/^\[Atendente:[^\]]*\]\s*[^:]*:\s*/gm, "").trim();
}

/** Remove prefixo "Nome: " de mensagens user (grupos/encaminhamentos WhatsApp). */
export function stripUserNamePrefix(content: string): string {
  return (content || "").replace(/^(?!https?:)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{0,24}):\s*/m, "").trim();
}

/** Remove vazamentos comuns de tools / prompts internos no texto do assistente */
export function sanitizeAssistantContent(content: string): string {
  if (!content) return content;
  let text = stripThoughtAndReasoningBlocks(stripToolNameLeakageForDisplay(content));
  text = text
    .replace(/Chamada de ferramenta\s*:\s*\n?\s*\{[\s\S]*?\}\s*/gim, "")
    .replace(/Chamada da ferramenta\s*:\s*\n?\s*\{[\s\S]*?\}\s*/gim, "")
    .replace(/\{\s*"tool_code"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[\s\S]*?\}\s*\}\s*/gim, "")
    .replace(/\*\*?tool_code[\s\S]*?\)\s*\)\*\*?/gim, "")
    .replace(/tool_code[\s\S]*?\)\s*\)(?=\s|$|\.|,|;)/gim, "")
    .replace(/\b(assign_agent|atribuir_agente|chatwoot_assign|consultar_unidade|nearest_unit)\s*\(\s*[^)]*\)/gim, "")
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
  return stripBrokenMarkdownImageLines(text);
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

/** Trecho `![alt](url)` com índices no string original (url sem o parêntese de fecho). */
export type MarkdownImageSpan = { start: number; end: number; url: string };

/** Compara URLs de imagem (incl. variação só de encoding) para deduplicar grelha vs. Markdown. */
export function imageUrlsEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return false;
  }
}

/**
 * Fim do URL em `![...](URL)` usando parênteses balanceados dentro do destino
 * (evita truncar em `)` válido no path, ex.: `arquivo(1).jpg`).
 */
function consumeMdImageUrl(s: string, urlStart: number): { url: string; endExclusive: number } | null {
  if (urlStart >= s.length) return null;
  let depth = 0;
  for (let p = urlStart; p < s.length; p++) {
    const c = s[p];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth > 0) depth--;
      else return { url: s.slice(urlStart, p).trim(), endExclusive: p + 1 };
    }
  }
  return null;
}

export function collectMarkdownImageSpans(content: string): MarkdownImageSpan[] {
  const spans: MarkdownImageSpan[] = [];
  let pos = 0;
  while (pos < content.length) {
    const i = content.indexOf("![", pos);
    if (i === -1) break;
    const j = content.indexOf("](", i + 2);
    if (j === -1) {
      pos = i + 2;
      continue;
    }
    let urlStart = j + 2;
    while (urlStart < content.length && /\s/.test(content[urlStart])) urlStart++;
    if (urlStart >= content.length) break;
    if (!content.startsWith("http://", urlStart) && !content.startsWith("https://", urlStart)) {
      pos = j + 2;
      continue;
    }
    const consumed = consumeMdImageUrl(content, urlStart);
    if (!consumed) break;
    spans.push({ start: i, end: consumed.endExclusive, url: consumed.url });
    pos = consumed.endExclusive;
  }
  return spans;
}

export function stripMarkdownImageSpans(content: string, spans: MarkdownImageSpan[]): string {
  if (!spans.length) return content;
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let text = content;
  for (const sp of sorted) {
    if (sp.start < 0 || sp.end > text.length || sp.end < sp.start) continue;
    text = text.slice(0, sp.start) + text.slice(sp.end);
  }
  return text;
}

/** Linhas só com `![…](https://…` incompleto (sem `)` de fecho) — ex.: URL truncado no stream. */
export function stripBrokenMarkdownImageLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith("![")) return true;
      const j = t.indexOf("](", 2);
      if (j === -1) return false;
      let urlStart = j + 2;
      while (urlStart < t.length && /\s/.test(t[urlStart])) urlStart++;
      if (urlStart >= t.length) return false;
      if (!t.startsWith("http://", urlStart) && !t.startsWith("https://", urlStart)) return true;
      return consumeMdImageUrl(t, urlStart) !== null;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractImages(content: string): { text: string; images: string[] } {
  const headerStripped = stripBrokenMarkdownImageLines(stripChatwootHeader(content));
  const spans = collectMarkdownImageSpans(headerStripped);
  const images: string[] = [];
  for (const sp of spans) {
    if (!images.includes(sp.url)) images.push(sp.url);
  }
  const text = stripMarkdownImageSpans(headerStripped, spans).trim();
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

type DedupeMsg = { id: string; role: string; content: string; created_at: string; metadata?: { chatwoot_message_id?: string } | null };

/**
 * Ordena por created_at e remove duplicatas (mesmo id, role+conteúdo no bucket, ou chatwoot_message_id).
 * Alinhado ao merge do Chat ao Vivo (`useMultiConversationMessages`).
 */
export function dedupeAndSortConversationMessages<T extends DedupeMsg>(messages: T[]): T[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const seenIds = new Set<string>();
  const seenContentKeys = new Set<string>();
  const seenChatwootIds = new Set<string>();
  const out: T[] = [];
  for (const m of sorted) {
    const t = Math.floor(new Date(m.created_at).getTime() / DEDUPE_TIME_BUCKET_MS);
    const ck = `${m.role}\t${(m.content || "").trim()}\t${t}`;
    const cwId = m.metadata?.chatwoot_message_id;
    if (seenIds.has(m.id)) continue;
    if (seenContentKeys.has(ck)) continue;
    if (cwId && seenChatwootIds.has(cwId)) continue;
    seenIds.add(m.id);
    seenContentKeys.add(ck);
    if (cwId) seenChatwootIds.add(cwId);
    out.push(m);
  }
  return out;
}
