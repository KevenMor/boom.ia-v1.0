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

/** Data de hoje em Brasília (YYYY-MM-DD), alinhada ao [CONTEXTO TEMPORAL] do system prompt. */
export function brasiliaTodayIso(ref: Date = new Date()): string {
  return ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function parseRelativeCheckIn(text: string, ref: Date): string | null {
  const t = normalizeText(text);
  if (!/\bhoje\b|\bagora\b|\bneste momento\b|\bdia de hoje\b/.test(t)) return null;
  return brasiliaTodayIso(ref);
}

function parseRelativeCheckOut(text: string, checkIn: string, ref: Date): string | null {
  const t = normalizeText(text);
  const today = brasiliaTodayIso(ref);

  if (/ate\s+amanha|ate\s+o\s+dia\s+de\s+amanha|ate\s+amanha\s+fim/.test(t)) {
    return isoAddDays(checkIn, 1);
  }
  if (/\bamanha\b/.test(t) && /ate|ate\s+o\s+dia|check[\s-]?out|saida/.test(t)) {
    return isoAddDays(checkIn, 1);
  }
  if (/\bhoje\b/.test(t) && /\bamanha\b/.test(t) && /ate|a\s+/.test(t)) {
    return isoAddDays(checkIn, 1);
  }
  if (checkIn === today && /\bamanha\b/.test(t) && /hosped|pernoite|estadia|hotel|quarto/.test(t)) {
    return isoAddDays(checkIn, 1);
  }
  return null;
}

/** Cliente corrigiu data errada que o assistente assumiu (ex.: "hoje não é dia 12"). */
export function messageDeclaresDateCorrection(text: string): boolean {
  const t = normalizeText(text);
  return (
    /hoje\s+nao\s+e|nao\s+e\s+(o\s+)?dia\s+\d|nao\s+e\s+hoje|data\s+errad|dia\s+errad|nao\s+e\s+12/.test(t) ||
    (/nao\s+e/.test(t) && /\bdia\s+\d{1,2}\b/.test(t))
  );
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
  if (/\bhoje\b|\bamanha\b|\bdia de hoje\b/.test(t)) return null;
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
  const userMessages = messages.filter((m) => m.role === "user" && m.content);

  if (userMessages.some((m) => messageDeclaresDateCorrection(m.content!))) {
    for (const m of [...userMessages].reverse()) {
      if (m.role !== "user" || !m.content) continue;
      if (messageDeclaresDateCorrection(m.content)) continue;
      const relative = parseRelativeCheckIn(m.content, ref);
      if (relative) return relative;
    }
    return brasiliaTodayIso(ref);
  }

  for (const m of [...userMessages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const relative = parseRelativeCheckIn(m.content, ref);
    if (relative) return relative;
    const explicit = parseExplicitDateIso(m.content, ref);
    if (explicit) return explicit;
    const event = parseEventCheckIn(m.content, ref);
    if (event) return event;
  }
  return null;
}

function extractCheckOutFromMessages(messages: ChatMessage[], checkIn: string, ref: Date): string | null {
  const thread = messages.map((m) => m.content ?? "").join("\n");
  const norm = normalizeText(thread);

  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const relativeOut = parseRelativeCheckOut(m.content, checkIn, ref);
    if (relativeOut) return relativeOut;
  }

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
  if (!conversationHasCompleteGuestComposition(messages)) return null;

  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const n = resolveGuestCountFromAnswer(m.content, messages);
    if (n != null) return n;
  }

  return null;
}

/** Nº informado pelo cliente (inclui "3" solto após pergunta de composição). */
export function resolveGuestCountFromAnswer(text: string, messages: ChatMessage[] = []): number | null {
  if (!text.trim()) return null;
  const t = normalizeText(text.trim());
  const fromExplicit = parseExplicitGuestCount(text);

  if (fromExplicit != null) {
    if (/pessoas?|adultos?|hospedes?/.test(t)) return fromExplicit;
    if (/^(dois|duas|tres|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)(\s+(apenas|so))?$/.test(t)) {
      return fromExplicit;
    }
    if (/^(apenas|so)\s+(dois|duas|tres|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)$/.test(t)) {
      return fromExplicit;
    }
  }

  const bareNum = t.match(/^(\d{1,2})$/);
  if (bareNum) return Math.min(20, parseInt(bareNum[1], 10));

  if (WORD_NUMBERS[t] != null && assistantAskedGuestComposition(messages)) return WORD_NUMBERS[t];

  return fromExplicit;
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

  const check_out = extractCheckOutFromMessages(messages, check_in, referenceDate);
  if (!check_out || check_out <= check_in) return null;

  const guestCount = extractGuestCountFromMessages(messages);
  if (guestCount == null || guestCount < 1) return null;

  if (!conversationHasCompleteGuestComposition(messages)) return null;

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

/** Há check-in inferível (hoje/amanhã, data explícita ou evento) no histórico do cliente. */
export function conversationHasDeclaredLodgingDates(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): boolean {
  return extractCheckInFromMessages(messages, referenceDate) != null;
}

/** Período inferível (check-in + check-out) quando ambos estão no histórico. */
export function extractSunsetLodgingDateRange(
  messages: ChatMessage[],
  referenceDate: Date = new Date()
): { check_in: string; check_out: string } | null {
  const check_in = extractCheckInFromMessages(messages, referenceDate);
  if (!check_in) return null;
  const check_out = extractCheckOutFromMessages(messages, check_in, referenceDate);
  if (!check_out || check_out <= check_in) return null;
  return { check_in, check_out };
}

export function messageUsesVagueGuestCountOnly(text: string, messages: ChatMessage[] = []): boolean {
  if (messageDeclaresGuestCompositionComplete(text)) return false;
  return resolveGuestCountFromAnswer(text, messages) != null;
}

export function messageDeclaresNoChildren(text: string): boolean {
  const t = normalizeText(text);
  return /sem\s+crianc|nao\s+tem\s+crianc|nenhuma\s+crianc|so\s+adultos|todos\s+adultos|somente\s+adultos|nao[,.\s]+so\s+adultos|nao[,.\s]+apenas\s+adultos/.test(
    t
  );
}

export function messageDeclaresChildAges(text: string): boolean {
  if (/idades?\s*:\s*\d+|\(\s*idades?/i.test(text)) return true;
  if (/\d+\s+anos?/.test(text)) return true;
  if (/crianc[aã]?\s+de\s+\d+|\bfilh[oa]\s+de\s+\d+|\bbeb[eê]\s+de\s+\d+/i.test(text)) return true;
  if (/\d+\s+mes(es)?/.test(normalizeText(text))) return true;
  return false;
}

/** Cliente disse que há criança(s), sem declarar ausência. */
export function messageMentionsChildren(text: string): boolean {
  if (messageDeclaresNoChildren(text)) return false;
  const t = normalizeText(text);

  const formChild = text.match(/criancas?\s*:\s*(\d+)/i);
  if (formChild && parseInt(formChild[1], 10) > 0) return true;

  if (/\d+\s+crianc|\b(uma|duas|tres|1|2|3)\s+crianc/.test(t)) return true;
  if (/tem\s+(crianc|menor|filh)|com\s+(crianc|menor|filh)|vai\s+crianc/.test(t)) return true;
  if (/bebes?|\bfilh/.test(t)) return true;
  if (/^sim\b/.test(t) && /crianc|menor|filh/.test(t)) return true;

  return false;
}

/** Resposta curta "sim" / "tem" à pergunta sobre crianças — ainda falta idade. */
export function messageAffirmsChildrenWithoutAges(text: string, messages: ChatMessage[]): boolean {
  if (messageDeclaresNoChildren(text) || messageDeclaresChildAges(text)) return false;
  const t = normalizeText(text.trim());
  if (!/^sim\b|^tem\b|^vai\b|^1\b|^uma\b/.test(t)) return false;

  const chronological = messages.filter((m) => m.content);
  const lastUser = [...chronological].reverse().find((m) => m.role === "user" && m.content);
  if (!lastUser || normalizeText(lastUser.content!.trim()) !== t) return false;

  const lastUserIndex = chronological.indexOf(lastUser);
  const lastAssistant = [...chronological.slice(0, lastUserIndex)]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);
  if (!lastAssistant?.content) return false;

  const assistantText = normalizeText(lastAssistant.content);
  return /crianc|menor|filh|idade|anos/.test(assistantText);
}

/** Composição explícita: adultos/crianças com idades, formulário do site, ou "sem crianças". */
export function messageDeclaresGuestCompositionComplete(text: string): boolean {
  const t = normalizeText(text);

  const formChild = text.match(/criancas?\s*:\s*(\d+)/i);
  if (/adultos\s*:\s*\d/i.test(text) || formChild) {
    const childCount = formChild ? parseInt(formChild[1], 10) : 0;
    if (childCount === 0) return /adultos\s*:\s*\d/i.test(text);
    return messageDeclaresChildAges(text);
  }

  if (messageDeclaresNoChildren(text)) return true;

  if (messageMentionsChildren(text)) {
    return messageDeclaresChildAges(text);
  }

  if (/\d+\s+adultos?/.test(t) && !/crianc|bebes?|\bfilh/.test(t)) return true;

  return false;
}

export function conversationHasCompleteGuestComposition(messages: ChatMessage[]): boolean {
  if (conversationNeedsChildAgesConfirmation(messages)) return false;

  const userTexts = messages.filter((m) => m.role === "user" && m.content).map((m) => m.content!);
  if (userTexts.length === 0) return false;

  const joined = userTexts.join("\n");
  if (/adultos\s*:\s*\d/i.test(joined) && /criancas?\s*:/i.test(joined)) {
    const childMatch = joined.match(/criancas?\s*:\s*(\d+)/i);
    const childCount = childMatch ? parseInt(childMatch[1], 10) : 0;
    if (childCount === 0) return true;
    return userTexts.some((text) => messageDeclaresChildAges(text));
  }

  for (const text of userTexts) {
    if (messageDeclaresGuestCompositionComplete(text)) return true;
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content);
  if (lastUser?.content && messageUsesVagueGuestCountOnly(lastUser.content, messages)) return false;

  return false;
}

/** Cliente confirmou criança(s) mas não informou idade(s). */
export function conversationNeedsChildAgesConfirmation(messages: ChatMessage[]): boolean {
  const userMsgs = messages.filter((m) => m.role === "user" && m.content);
  if (userMsgs.length === 0) return false;

  if (userMsgs.some((m) => messageDeclaresNoChildren(m.content!))) return false;

  const joined = userMsgs.map((m) => m.content!).join("\n");
  const formChild = joined.match(/criancas?\s*:\s*(\d+)/i);
  if (formChild && parseInt(formChild[1], 10) > 0) {
    return !userMsgs.some((m) => messageDeclaresChildAges(m.content!));
  }

  let mentionedChildren = false;
  let hasAges = false;

  for (const m of userMsgs) {
    const text = m.content!;
    if (messageMentionsChildren(text)) mentionedChildren = true;
    if (messageAffirmsChildrenWithoutAges(text, messages)) mentionedChildren = true;
    if (messageDeclaresChildAges(text)) hasAges = true;
  }

  return mentionedChildren && !hasAges;
}

/** Já sabe quantas pessoas, mas falta confirmar crianças (ex.: respondeu só "3"). */
export function conversationNeedsChildrenConfirmation(messages: ChatMessage[]): boolean {
  if (conversationHasCompleteGuestComposition(messages)) return false;
  if (conversationNeedsChildAgesConfirmation(messages)) return false;
  for (const m of messages) {
    if (m.role !== "user" || !m.content) continue;
    if (resolveGuestCountFromAnswer(m.content, messages) != null) return true;
  }
  return false;
}

export function conversationHasDeclaredGuestCount(messages: ChatMessage[]): boolean {
  return conversationNeedsChildrenConfirmation(messages) || conversationHasCompleteGuestComposition(messages);
}

const SUNSET_NON_NAME_WORDS = new Set([
  "hospedagem",
  "parque",
  "orcamento",
  "ingresso",
  "oi",
  "ola",
  "sim",
  "nao",
  "ok",
  "hoje",
  "amanha",
  "tres",
  "duas",
  "dois",
  "quero",
  "preciso",
]);

function capitalizeNameToken(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Nome só quando o cliente declarou explicitamente — não inferir de frases de hospedagem. */
export function extractSunsetClientNameFromMessages(messages: ChatMessage[]): string | undefined {
  const chronological = messages.filter((m) => m.content);

  for (const m of chronological) {
    if (m.role !== "user" || !m.content) continue;
    const raw = m.content.trim();
    const t = normalizeText(raw);

    const declared = raw.match(
      /(?:me\s+chamo|sou\s+(?:o|a)|pode\s+me\s+chamar|meu\s+nome\s+[eé]|aqui\s+[eé]\s+(?:o|a)?)\s+([A-Za-zÀ-ÿ]{2,30})/i
    );
    if (declared?.[1]) return capitalizeNameToken(declared[1]);

    const prefix = raw.match(/^([A-Za-zÀ-ÿ]{2,24}),\s+/);
    if (prefix?.[1]) {
      const w = normalizeText(prefix[1]);
      if (!SUNSET_NON_NAME_WORDS.has(w)) return capitalizeNameToken(prefix[1]);
    }
  }

  const lastUser = [...chronological].reverse().find((m) => m.role === "user" && m.content);
  if (!lastUser?.content) return undefined;

  const lastUserIndex = chronological.findIndex((m) => m === lastUser);
  const priorMessages = chronological.slice(0, lastUserIndex);
  const lastAssistant = [...priorMessages].reverse().find((m) => m.role === "assistant" && m.content);
  if (!lastAssistant?.content) return undefined;

  const askedName = /como prefere ser chamad|seu nome|como posso te chamar|como prefere ser chamada/i.test(
    lastAssistant.content
  );
  if (!askedName) return undefined;

  const line = lastUser.content.trim();
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length !== 1) return undefined;

  const w = normalizeText(words[0]);
  if (SUNSET_NON_NAME_WORDS.has(w) || !/^[a-zà-ÿ]{2,30}$/.test(w)) return undefined;

  return capitalizeNameToken(words[0]);
}

export function messageDeclaresRelativeLodgingStay(text: string): boolean {
  const t = normalizeText(text);
  return (
    /\bhoje\b/.test(t) &&
    (/\bamanha\b/.test(t) || /ate\s+amanha/.test(t) || /pernoite|estadia|hosped/.test(t))
  );
}

/** Cliente demonstra interesse em reservar ou escolhe categoria (conversão SDR). */
export function messageDeclaresLodgingReservationInterest(text: string): boolean {
  const t = normalizeText(text);
  if (
    /quero reservar|quero fechar|como reserv|como faco (pra )?reserv|manda (o )?link|fechamos|vamos fechar|como faco pra fechar|dar seguimento|fazer a reserva|segue com a reserva/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /(gostei|escolho|prefiro|vamos (no|de|com)|quero (o|a|um|essa|esse))/.test(t) &&
    /standart|standard|luxo|chale|suite|loft|master|apartamento|aconchegante|aconchego/.test(t)
  ) {
    return true;
  }
  if (/^sim[,!.?\s]*(pode|quero|vamos|fecha)/.test(t)) {
    return true;
  }
  return false;
}
