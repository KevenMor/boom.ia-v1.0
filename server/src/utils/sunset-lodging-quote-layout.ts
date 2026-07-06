const SECTION_HEADER_RE =
  /^(\*Resumo\*|\*Op[cç][õo]es\*|\*Incluso[^\n]*\*|\*Hor[aá]rios[^\n]*\*|\*Pagamento[^\n]*\*|Valores sujeitos[^\n]*)/i;

const CLOSING_QUESTION_RE =
  /(Das opções[^\n?]*\?|Qual (?:combina|dessas|opção)[^\n?]*\?|Qual categoria[^\n?]*\?)\s*$/i;

/** Quebra linhas amontoadas com · ou ; em bullets legíveis. */
export function expandDenseListLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (SECTION_HEADER_RE.test(trimmed)) return [trimmed];

  const splitters = trimmed.includes("·")
    ? trimmed.split(/\s*·\s*/)
    : trimmed.includes(";")
      ? trimmed.split(/\s*;\s*/)
      : null;

  if (!splitters || splitters.length <= 1) {
    if (trimmed.startsWith("•") || trimmed.startsWith("-")) return [trimmed];
    return [`• ${trimmed}`];
  }

  return splitters
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("•") ? p : `• ${p}`));
}

function polishSectionBlock(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (SECTION_HEADER_RE.test(line)) {
      if (out.length > 0) out.push("");
      out.push(line);
      continue;
    }
    out.push(...expandDenseListLine(line));
  }
  return out;
}

/** Intro + rodapé do orçamento com respiração visual (bullets e linhas em branco). */
export function polishSunsetLodgingQuoteReadableText(text: string): string {
  const base = (text ?? "").trim();
  if (!base) return text;

  const lines = base.split(/\r?\n/);
  const out: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const joined = paragraphBuffer.join(" ").replace(/\s+/g, " ").trim();
    if (joined) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(joined);
    }
    paragraphBuffer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    if (SECTION_HEADER_RE.test(line)) {
      flushParagraph();
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(line);
      continue;
    }

    if (line.startsWith("![") || line.includes("R$")) {
      flushParagraph();
      out.push(raw);
      continue;
    }

    if (line.includes("·") || line.includes(";")) {
      flushParagraph();
      out.push(...polishSectionBlock([line]));
      continue;
    }

    if (line.startsWith("•") || line.startsWith("-")) {
      flushParagraph();
      out.push(line);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractLodgingQuoteClosingQuestion(text: string): {
  body: string;
  question: string;
} {
  const base = (text ?? "").trim();
  const match = base.match(CLOSING_QUESTION_RE);
  if (!match?.index) return { body: base, question: "" };
  const question = match[0].trim();
  const body = base.slice(0, match.index).trim();
  return { body, question };
}

/** Separa pergunta de fechamento em bolha própria (após rodapé). */
export function splitLodgingQuoteClosingQuestion(text: string): string {
  const { body, question } = extractLodgingQuoteClosingQuestion(text);
  if (!question) return text;
  return `${body}\n\n${question}`;
}
