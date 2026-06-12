/** Extrai parâmetros de consultar_hospedagem_sunset do histórico (Sunset Thermas). */

export type SunsetLodgingGuest = { type: "adult" } | { type: "child"; age: number };

export type SunsetLodgingParams = {
  check_in: string;
  check_out: string;
  guests: SunsetLodgingGuest[];
  /** Ex.: loft, hidromassagem — força tarifa complementar quando ocupação mínima não bate. */
  interest_keywords?: string[];
};

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
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
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

function isFriday(iso: string): boolean {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() === 5;
}

function yearForFixedEvent(month: number, day: number, ref: Date): number {
  const y = ref.getFullYear();
  const eventUtc = Date.UTC(y, month - 1, day);
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return eventUtc < refUtc ? y + 1 : y;
}

/** Número explícito de hóspedes na mensagem (não infere de "namorados", "casal", etc.). */
export function parseExplicitGuestCount(text: string): number | null {
  const t = normalizeText(text.trim());
  if (!t) return null;

  if (/^(dois|duas)(\s+(apenas|so))?$/.test(t) || /^(apenas|so)\s+(dois|duas)$/.test(t)) {
    return 2;
  }

  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`^${word}(\\s+(apenas|so))?$`).test(t)) return n;
  }

  const withLabel = t.match(/\b(\d{1,2})\s*(pessoas?|adultos?|hospedes?)\b/);
  if (withLabel) return Math.min(20, parseInt(withLabel[1], 10));

  const wordWithLabel = t.match(
    /\b(um|uma|dois|duas|tres|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(pessoas?|adultos?|hospedes?)\b/
  );
  if (wordWithLabel && WORD_NUMBERS[wordWithLabel[1]]) {
    return WORD_NUMBERS[wordWithLabel[1]];
  }

  const alone = t.match(/^\s*(\d{1,2})\s*$/);
  if (alone && assistantWouldAcceptBareNumber(t)) return Math.min(20, parseInt(alone[1], 10));

  return null;
}

function assistantWouldAcceptBareNumber(_normalizedUserText: string): boolean {
  return false;
}

export function assistantAskedGuestComposition(messages: ChatMessage[]): boolean {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant?.content) return false;
  const t = normalizeText(lastAssistant.content);
  return /quantas?\s+pessoas|quantos?\s+adultos|quantas?\s+pessoas vao|composicao|criancas?/.test(t);
}

function parseExplicitDateIso(text: string, ref: Date): string | null {
  const t = text;
  const ymd = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const dmy4 = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (dmy4) {
    const dd = dmy4[1].padStart(2, "0");
    const mm = dmy4[2].padStart(2, "0");
    return `${dmy4[3]}-${mm}-${dd}`;
  }

  const dmy2 = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dmy2) {
    const dd = dmy2[1].padStart(2, "0");
    const mm = dmy2[2].padStart(2, "0");
    const y = yearForFixedEvent(parseInt(mm, 10), parseInt(dd, 10), ref);
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

function parseEventCheckIn(text: string, ref: Date): string | null {
  const t = normalizeText(text);
  if (/dia dos namorados/.test(t)) {
    const y = yearForFixedEvent(6, 12, ref);
    return `${y}-06-12`;
  }
  if (/dia das maes/.test(t)) return null;
  if (/\bnatal\b/.test(t)) {
    const y = yearForFixedEvent(12, 25, ref);
    return `${y}-12-25`;
  }
  if (/reveillon|virada do ano/.test(t)) {
    const y = yearForFixedEvent(12, 31, ref);
    return `${y}-12-31`;
  }
  return null;
}

function extractCheckInFromMessages(messages: ChatMessage[], ref: Date): string | null {
  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const explicit = parseExplicitDateIso(m.content, ref);
    if (explicit) return explicit;
    const event = parseEventCheckIn(m.content, ref);
    if (event) return event;
  }
  return null;
}

function extractCheckOutFromMessages(messages: ChatMessage[], checkIn: string): string | null {
  const thread = messages.map((m) => m.content ?? "").join("\n");
  const norm = normalizeText(thread);

  const explicit = parseExplicitDateIso(thread, new Date(`${checkIn}T12:00:00Z`));
  if (explicit && explicit > checkIn) {
    const checkOutLabels = /check[\s-]?out|saida|ate\s+(o\s+)?dia|ate\s+\d{1,2}\/\d{1,2}/i.test(thread);
    if (checkOutLabels) return explicit;
  }

  const range = thread.match(
    /\b(?:de|do)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s+(?:a|ao|ate)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?/i
  );
  if (range) {
    const yOut = range[6] ?? range[3] ?? checkIn.slice(0, 4);
    const dd = range[4].padStart(2, "0");
    const mm = range[5].padStart(2, "0");
    const out = `${yOut}-${mm}-${dd}`;
    if (out > checkIn) return out;
  }

  const shortStay = /so\s+uma\s+noite|so\s+o\s+dia\s+\d|apenas\s+uma\s+noite/i.test(norm);
  if (isFriday(checkIn) && !shortStay) {
    return isoAddDays(checkIn, 2);
  }

  const nightsMatch = norm.match(/(\d+)\s+noites?/);
  if (nightsMatch) {
    const n = parseInt(nightsMatch[1], 10);
    if (n > 0) return isoAddDays(checkIn, n);
  }

  return null;
}

function extractGuestCountFromMessages(messages: ChatMessage[]): number | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return null;

  const fromLast = parseExplicitGuestCount(lastUser.content);
  if (fromLast != null) {
    const t = normalizeText(lastUser.content);
    const hasLabel = /pessoas?|adultos?|hospedes?/.test(t);
    if (hasLabel || assistantAskedGuestComposition(messages)) return fromLast;
  }

  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const t = normalizeText(m.content);
    const n = parseExplicitGuestCount(m.content);
    if (n != null && /pessoas?|adultos?|hospedes?/.test(t)) return n;
  }

  return null;
}

/** Palavras-chave de categoria pedida na última mensagem (loft, hidromassagem, etc.). */
export function detectSunsetLodgingInterestKeywords(text: string): string[] {
  const t = normalizeText(text);
  const keywords: string[] = [];
  if (/loft|spa\b|com spa/.test(t)) keywords.push("loft");
  if (/hidromassagem|hidro\b|jacuzzi/.test(t)) keywords.push("hidromassagem");
  if (/master/.test(t)) keywords.push("master");
  if (/piscina|represa|apartamento/.test(t)) keywords.push("piscina");
  if (/chal[eé]|standart|standard/.test(t)) keywords.push("chalé");
  return keywords;
}

export function parseLodgingAccommodationNamesFromToolContent(content: string): string[] {
  try {
    const obj = JSON.parse(content) as { available_accommodations?: Array<{ name?: string }> };
    if (!Array.isArray(obj.available_accommodations)) return [];
    return obj.available_accommodations.map((a) => String(a.name ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

/** Cliente pergunta tarifa/detalhe de categoria específica (loft, hidro, suíte…). */
export function userAsksSunsetLodgingCategoryOrPrice(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return false;
  const text = lastUser.content;
  if (detectSunsetLodgingInterestKeywords(text).length > 0) return true;
  const t = normalizeText(text);
  const asksPrice = /quanto\s+(fica|custa|e)|valor|preco|tarifa/.test(t);
  const aboutLodging = /hosped|acomoda|quarto|suite|loft|spa|hidro|hidromassagem/.test(t);
  const asksOption = /tem algum|tem alguma|gostei|saber mais|detalhe/.test(t);
  return (asksPrice && aboutLodging) || (asksOption && aboutLodging);
}

/** Reconsultar quando a categoria pedida não consta no último resultado da tool. */
export function shouldReinvokeSunsetLodging(messages: ChatMessage[], toolContents: string[]): boolean {
  if (!userAsksSunsetLodgingCategoryOrPrice(messages)) return false;
  if (toolContents.length === 0) return true;

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return false;

  const interests = detectSunsetLodgingInterestKeywords(lastUser.content);
  const knownNorm = toolContents
    .flatMap(parseLodgingAccommodationNamesFromToolContent)
    .map((n) => normalizeText(n));

  if (interests.length === 0) {
    return /quanto|valor|preco|tarifa|fica/.test(normalizeText(lastUser.content));
  }

  const patterns: Record<string, RegExp> = {
    loft: /loft|spa/,
    hidromassagem: /loft|spa|hidro/,
    master: /master/,
    piscina: /piscina|represa/,
    chalé: /standart|chal/,
  };

  return interests.some((interest) => {
    const re = patterns[interest];
    if (!re) return true;
    return !knownNorm.some((n) => re.test(n));
  });
}

/**
 * Retorna parâmetros completos para lodging_consulta quando datas + composição
 * estão explícitas no histórico. Null se faltar check-out derivável ou nº de hóspedes.
 */
export function extractSunsetLodgingParams(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): SunsetLodgingParams | null {
  const check_in = extractCheckInFromMessages(messages, referenceDate);
  if (!check_in) return null;

  const check_out = extractCheckOutFromMessages(messages, check_in);
  if (!check_out || check_out <= check_in) return null;

  const guestCount = extractGuestCountFromMessages(messages);
  if (guestCount == null || guestCount < 1) return null;

  const guests: SunsetLodgingGuest[] = Array.from({ length: guestCount }, () => ({ type: "adult" }));

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const interest_keywords = lastUser?.content
    ? detectSunsetLodgingInterestKeywords(lastUser.content)
    : [];

  return {
    check_in,
    check_out,
    guests,
    ...(interest_keywords.length > 0 ? { interest_keywords } : {}),
  };
}

export function isSunsetThermasTenantSlug(slug: string | null | undefined): boolean {
  return slug === "sunset-thermas" || slug === "sunset-thermas-park";
}

/** Há check-in inferível (data explícita ou evento como Dia dos Namorados) no histórico do cliente. */
export function conversationHasDeclaredLodgingDates(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): boolean {
  return extractCheckInFromMessages(messages, referenceDate) != null;
}
