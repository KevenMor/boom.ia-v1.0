/** Extrai data(s) de visita ao parque do histórico (Sunset Thermas). */

import {
  brasiliaTodayIso,
  extractSunsetLodgingDateRange,
} from "./sunset-lodging-params.js";

type ChatMessage = { role: string; content?: string };

export type SunsetParkParams = {
  date: string;
  date_to?: string;
};

const MONTH_NAMES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function inferMonthFromThread(thread: string, ref: Date): number | null {
  const norm = normalizeText(thread);
  for (const [name, month] of Object.entries(MONTH_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(norm)) return month;
  }
  const mm = thread.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (mm) return parseInt(mm[2], 10);
  const ymd = thread.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (ymd) return parseInt(ymd[2], 10);
  return ref.getMonth() + 1;
}

function inferYearForMonth(month: number, ref: Date): number {
  const y = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  if (month < refMonth) return y + 1;
  return y;
}

function buildIsoFromDayMonth(day: number, month: number, ref: Date): string {
  const y = inferYearForMonth(month, ref);
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Intervalo explícito no histórico: "01 a 03 de julho", "de 01/07 a 03/07", etc. */
export function extractParkVisitDateRange(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): { date: string; date_to: string } | null {
  const thread = messages.map((m) => m.content ?? "").join("\n");

  const fullRange = thread.match(
    /\b(?:de|do)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s+(?:a|ao|ate)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?/i
  );
  if (fullRange) {
    const yIn = fullRange[3] ?? fullRange[6] ?? String(referenceDate.getFullYear());
    const yOut = fullRange[6] ?? fullRange[3] ?? yIn;
    const date = `${yIn}-${fullRange[2].padStart(2, "0")}-${fullRange[1].padStart(2, "0")}`;
    const date_to = `${yOut}-${fullRange[5].padStart(2, "0")}-${fullRange[4].padStart(2, "0")}`;
    if (date_to >= date) return { date, date_to };
  }

  const shortRange =
    thread.match(/\b(\d{1,2})\s+a\s+(\d{1,2})\s+de\s+([a-zç]+)/i) ??
    thread.match(/\bde\s+(\d{1,2})\s+a\s+(\d{1,2})\s+de\s+([a-zç]+)/i);
  if (shortRange) {
    const monthName = normalizeText(shortRange[3]);
    const month = MONTH_NAMES[monthName];
    if (month) {
      const d1 = parseInt(shortRange[1], 10);
      const d2 = parseInt(shortRange[2], 10);
      const date = buildIsoFromDayMonth(d1, month, referenceDate);
      const date_to = buildIsoFromDayMonth(d2, month, referenceDate);
      if (date_to >= date) return { date, date_to };
    }
  }

  const bareShort = thread.match(/\b(\d{1,2})\s+a\s+(\d{1,2})\b/);
  if (bareShort) {
    const month = inferMonthFromThread(thread, referenceDate);
    if (month) {
      const d1 = parseInt(bareShort[1], 10);
      const d2 = parseInt(bareShort[2], 10);
      const date = buildIsoFromDayMonth(d1, month, referenceDate);
      const date_to = buildIsoFromDayMonth(d2, month, referenceDate);
      if (date_to >= date) return { date, date_to };
    }
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
  return /hor[aá]rio|funciona|abre|aberto|fecha|passar.*dia|somente o dia|esta aberto|est[aá] aberto/.test(t);
}

/**
 * Retorna `{ date, date_to? }` quando o cliente pergunta sobre parque/ingresso
 * e a(s) data(s) podem ser inferidas do histórico.
 */
export function extractSunsetParkParams(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): SunsetParkParams | null {
  if (!userAsksSunsetParkConsultation(messages)) return null;

  const range = extractParkVisitDateRange(messages, referenceDate);
  if (range) return range;

  const lodging = extractSunsetLodgingDateRange(messages, referenceDate);
  if (lodging) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const asksOpen = lastUser?.content
      ? /aberto|abre|funciona|fecha|fechado/.test(normalizeText(lastUser.content))
      : false;
    if (asksOpen) {
      const visitEnd =
        lodging.check_out > lodging.check_in
          ? isoAddDays(lodging.check_out, -1)
          : lodging.check_in;
      if (visitEnd > lodging.check_in) {
        return { date: lodging.check_in, date_to: visitEnd };
      }
      return { date: lodging.check_in };
    }
  }

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
    content.includes('"days"') ||
    content.includes('"closed_dates"') ||
    /"status"\s*:\s*"no_data"/.test(content)
  );
}

export function hasSunsetParkToolResult(toolContents: string[]): boolean {
  return toolContents.some(messageContentLooksLikeParkResult);
}

/** Cliente perguntou ou demonstrou interesse no Thermas Card (assinatura). */
export function messageDeclaresThermasCardIntent(text: string): boolean {
  const t = normalizeText(text);
  return (
    /thermas\s*card|cartao\s*thermas|cartão\s*thermas|clube\s*thermas|assinatura\s*thermas|quero\s+o\s+cartao|quero\s+o\s+cartão/.test(
      t
    ) || (/thermas/.test(t) && /\bcard\b|cartao|cartão|assinatura|clube/.test(t))
  );
}

export function conversationDeclaresThermasCardIntent(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => m.role === "user" && m.content && messageDeclaresThermasCardIntent(m.content)
  );
}

/**
 * Thermas Card §3g-compare: auto-consultar ingresso quando há composição ou objeção de preço.
 */
export function shouldAutoInvokeParkForThermasCard(messages: ChatMessage[]): boolean {
  if (!conversationDeclaresThermasCardIntent(messages)) return false;
  const norm = normalizeText(messages.map((m) => m.content ?? "").join("\n"));
  const hasComposition =
    /\b(\d+|duas?|dois|tres|tr[eê]s|quatro|cinco)\s*(pessoas?|adultos?|gente)\b/.test(norm) ||
    /\bcasal\b|n[oó]s\s+dois|somos\s+duas?|somos\s+dois|eu\s+e\s+(meu|minha)/.test(norm);
  const hasPriceConcern =
    /caro|compensa|vale a pena|ingresso|compar|meio caro|achei caro|preco alto|preço alto/.test(norm);
  return hasComposition || hasPriceConcern;
}

/** Data de referência para comparar ingresso × Thermas Card (default: hoje). */
export function extractSunsetParkParamsForThermasCard(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): SunsetParkParams | null {
  if (!shouldAutoInvokeParkForThermasCard(messages)) return null;

  const range = extractParkVisitDateRange(messages, referenceDate);
  if (range) return range;

  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const relative = parseRelativeVisitDate(m.content, referenceDate);
    if (relative) return { date: relative };
    const explicit = parseExplicitDateIso(m.content, referenceDate);
    if (explicit) return { date: explicit };
  }

  return { date: brasiliaTodayIso(referenceDate) };
}
