/** Extrai data de visita ao parque do histórico (Sunset Thermas). */

type ChatMessage = { role: string; content?: string };

const WORD_NUMBERS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function brasiliaTodayIso(ref: Date): string {
  return ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function yearForFixedEvent(month: number, day: number, ref: Date): number {
  const y = ref.getFullYear();
  const eventUtc = Date.UTC(y, month - 1, day);
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return eventUtc < refUtc ? y + 1 : y;
}

function parseExplicitDateIso(text: string, ref: Date): string | null {
  const ymd = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const dmy4 = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (dmy4) {
    const dd = dmy4[1].padStart(2, "0");
    const mm = dmy4[2].padStart(2, "0");
    return `${dmy4[3]}-${mm}-${dd}`;
  }

  const dmy2 = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dmy2) {
    const dd = dmy2[1].padStart(2, "0");
    const mm = dmy2[2].padStart(2, "0");
    const y = yearForFixedEvent(parseInt(mm, 10), parseInt(dd, 10), ref);
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

function parseRelativeVisitDate(text: string, ref: Date): string | null {
  const t = normalizeText(text);
  const today = brasiliaTodayIso(ref);

  if (/\bhoje\b|\bagora\b|\bneste momento\b/.test(t)) return today;
  if (/\bamanha\b/.test(t)) return isoAddDays(today, 1);
  if (/depois de amanha/.test(t)) return isoAddDays(today, 2);

  if (/dia dos namorados/.test(t)) {
    const y = yearForFixedEvent(6, 12, ref);
    return `${y}-06-12`;
  }

  return null;
}

/** Cliente pergunta valor/preço de ingresso ou ir ao parque (sem hospedagem). */
export function messageDeclaresParkTicketPriceQuestion(text: string): boolean {
  const t = normalizeText(text);
  if (!/parque|ingresso|\bpark\b/.test(t)) return false;
  if (/hospedagem|hotel|pernoite|estadia|chal[eé]|suite|loft|quarto/.test(t) && !/parque|ingresso|\bpark\b/.test(t)) {
    return false;
  }
  const asksPrice = /valor|preco|quanto|ingresso|custa|fica quanto/.test(t);
  const visitIntent = /ir ao parque|ir ao park|ir no parque|entrar no parque|passar o dia|curtir.*parque/.test(t);
  return asksPrice || (visitIntent && /hoje|amanha|\d{1,2}\/\d{1,2}/.test(t));
}

export function userAsksSunsetParkConsultation(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return false;
  const text = lastUser.content;
  if (messageDeclaresParkTicketPriceQuestion(text)) return true;
  const t = normalizeText(text);
  if (!/parque|ingresso|\bpark\b/.test(t)) return false;
  if (/hospedagem|hotel|pernoite/.test(t) && !/parque|ingresso|\bpark\b/.test(t)) return false;
  return /hor[aá]rio|funciona|abre|fecha|passar.*dia|somente o dia/.test(t);
}

/**
 * Retorna `{ date: YYYY-MM-DD }` quando o cliente pergunta sobre parque/ingresso
 * e a data pode ser inferida (hoje, amanhã, data explícita).
 */
export function extractSunsetParkParams(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): { date: string } | null {
  if (!userAsksSunsetParkConsultation(messages)) return null;

  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const relative = parseRelativeVisitDate(m.content, referenceDate);
    if (relative) return { date: relative };
    const explicit = parseExplicitDateIso(m.content, referenceDate);
    if (explicit) return { date: explicit };
  }

  const today = brasiliaTodayIso(referenceDate);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (lastUser?.content && messageDeclaresParkTicketPriceQuestion(lastUser.content)) {
    return { date: today };
  }

  return null;
}

function messageContentLooksLikeParkResult(content: string): boolean {
  return (
    content.includes('"ticket_lines"') ||
    content.includes('"park_open"') ||
    /"status"\s*:\s*"no_data"/.test(content)
  );
}

export function hasSunsetParkToolResult(toolContents: string[]): boolean {
  return toolContents.some(messageContentLooksLikeParkResult);
}
