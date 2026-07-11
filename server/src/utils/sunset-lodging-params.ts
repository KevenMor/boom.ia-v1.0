/** Extrai parâmetros de consultar_hospedagem_sunset do histórico (Sunset Thermas). */

import { userLikelyAskedForPhotos } from "./suite-gallery-markdown-inject.js";

export type SunsetLodgingGuest = { type: "adult" } | { type: "child"; age: number };

export type SunsetLodgingParams = {
  check_in: string;
  check_out: string;
  guests: SunsetLodgingGuest[];
  /** Ex.: loft, hidromassagem — força tarifa complementar quando ocupação mínima não bate. */
  interest_keywords?: string[];
};

type ChatMessage = { role: string; content?: string };

/** Força Loft na tool quando ocupação < mínimo do Loft (§3b-Loft / dispatcher v1.5.32). */
export const SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS = ["loft", "spa", "hidromassagem"] as const;

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

/** Assistente perguntou especificamente sobre crianças no fio. */
export function assistantAskedAboutChildren(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content &&
      /alguma crianca|crianca vai junto|quantas crianc|tem crianc|com crianc|menor(es)?|filh/.test(
        normalizeText(m.content),
      ),
  );
}

/** Extrai idades citadas (ex.: "uma de 3 anos e uma de 10"). */
export function parseChildAgesFromText(text: string): number[] {
  const ages: number[] = [];
  const seen = new Set<number>();
  const add = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 17 || seen.has(n)) return;
    ages.push(n);
    seen.add(n);
  };

  for (const m of text.matchAll(/\b(\d{1,2})\s+anos?\b/gi)) add(m[1]);
  for (const m of text.matchAll(
    /\b(?:uma|duas|tres|tr[eê]s|quatro|cinco|seis|\d{1,2})\s+de\s+(\d{1,2})(?:\s+anos?)?\b/gi,
  )) {
    add(m[1]);
  }
  return ages;
}

function extractTotalGuestCountFromScopedMessages(messages: ChatMessage[]): number | null {
  for (const m of messages) {
    if (m.role !== "user" || !m.content) continue;
    const n = resolveGuestCountFromAnswer(m.content, messages);
    if (n != null && /\bpessoas?\b|\badultos?\b|\bhospedes?\b/.test(normalizeText(m.content))) {
      return n;
    }
  }
  return null;
}

function buildSunsetLodgingGuests(messages: ChatMessage[], totalCount: number): SunsetLodgingGuest[] {
  const userMsgs = messages.filter((m) => m.role === "user" && m.content);
  if (userMsgs.some((m) => messageDeclaresNoChildren(m.content!))) {
    return Array.from({ length: totalCount }, () => ({ type: "adult" }));
  }

  const childAges: number[] = [];
  for (const m of userMsgs) childAges.push(...parseChildAgesFromText(m.content!));

  if (childAges.length > 0) {
    const adults = Math.max(0, totalCount - childAges.length);
    return [
      ...Array.from({ length: adults }, () => ({ type: "adult" as const })),
      ...childAges.map((age) => ({ type: "child" as const, age })),
    ];
  }

  return Array.from({ length: totalCount }, () => ({ type: "adult" }));
}

function conversationDeclaresChildrenAnswerInThread(messages: ChatMessage[]): boolean {
  const userMsgs = messages.filter((m) => m.role === "user" && m.content);
  if (userMsgs.some((m) => messageDeclaresNoChildren(m.content!))) return true;
  if (!assistantAskedAboutChildren(messages)) return false;
  return userMsgs.some((m) => parseChildAgesFromText(m.content!).length > 0);
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

/** "dia 18 e 19/07", "para o dia 18 e 19/07" → check-in 18/07, check-out 19/07. */
function parseDayAndSlashDateRangeIso(
  text: string,
  ref: Date,
): { check_in: string; check_out: string } | null {
  const m = text.match(
    /\b(?:para\s+o\s+)?(?:dia\s+)?(\d{1,2})\s+e\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/i,
  );
  if (!m) return null;

  const dayIn = parseInt(m[1], 10);
  const dayOut = parseInt(m[2], 10);
  const mm = m[3].padStart(2, "0");
  const y = m[4] ?? String(yearForFixedEvent(parseInt(mm, 10), dayOut, ref));
  const check_in = `${y}-${mm}-${String(dayIn).padStart(2, "0")}`;
  const check_out = `${y}-${mm}-${String(dayOut).padStart(2, "0")}`;
  if (check_out <= check_in) return null;
  return { check_in, check_out };
}

function findDayAndSlashDateRangeInMessages(
  messages: ChatMessage[],
  ref: Date,
): { check_in: string; check_out: string } | null {
  for (const m of [...messages].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    const range = parseDayAndSlashDateRangeIso(m.content, ref);
    if (range) return range;
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
    const range = parseDayAndSlashDateRangeIso(m.content, ref);
    if (range) return range.check_in;
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

  const daySlashRange = findDayAndSlashDateRangeInMessages(messages, ref);
  if (daySlashRange?.check_in === checkIn) return daySlashRange.check_out;

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

  const rangeWithPrefix = thread.match(
    /\b(?:de|do|dia)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s+(?:a|ao|ate)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?/i,
  );
  const rangeBare = thread.match(
    /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\s+(?:a|ao|ate)\s+(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?/i,
  );
  const range = rangeWithPrefix ?? rangeBare;
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

  if (shouldDefaultSingleNightCheckout(messages, checkIn, ref)) {
    return isoAddDays(checkIn, 1);
  }

  return null;
}

function findLastUserCheckInMessageIndex(
  messages: ChatMessage[],
  checkIn: string,
  ref: Date,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !m.content) continue;
    if (parseExplicitDateIso(m.content, ref) === checkIn) return i;
    if (parseRelativeCheckIn(m.content, ref) === checkIn) return i;
    if (parseEventCheckIn(m.content, ref) === checkIn) return i;
  }
  return -1;
}

/** Cliente informou check-in no fio mas ainda não check-out — assume 1 noite. */
function shouldDefaultSingleNightCheckout(
  messages: ChatMessage[],
  checkIn: string,
  ref: Date,
): boolean {
  const userMsgs = messages.filter((m) => m.role === "user" && m.content);
  if (userMsgs.length === 0) return false;

  const checkInIdx = findLastUserCheckInMessageIndex(messages, checkIn, ref);
  const scopedMessages = checkInIdx >= 0 ? messages.slice(checkInIdx) : messages;

  const threadNorm = normalizeText(scopedMessages.map((m) => m.content ?? "").join("\n"));
  if (
    /\bate\s+\d{1,2}\/\d{1,2}|\bcheck[\s-]?out|\b(?:de|do|dia)\s+\d{1,2}\/\d{1,2}\s+(?:a|ao|ate)\s+\d|\b\d{1,2}\/\d{1,2}\s+(?:a|ao|ate)\s+\d{1,2}\/\d|\b\d{1,2}\s+e\s+\d{1,2}\/\d{1,2}/.test(
      threadNorm,
    )
  ) {
    return false;
  }
  if (/\b\d+\s+noites?\b/.test(threadNorm)) return false;

  const hasCheckInDeclared = checkInIdx >= 0;
  if (!hasCheckInDeclared) return false;

  const explicitOut = scopedMessages
    .slice(1)
    .filter((m) => m.role === "user" && m.content)
    .map((m) => parseExplicitDateIso(m.content!, ref))
    .filter((d): d is string => d != null && d > checkIn);
  if (explicitOut.length > 0) return false;

  return true;
}

/** Contagem do formulário do site: `Adultos: N` (+ `Crianças: M` quando presente). */
function parseFormGuestCountFromText(text: string): number | null {
  const adultMatch = text.match(/adultos\s*:\s*(\d+)/i);
  if (!adultMatch) return null;
  const adults = parseInt(adultMatch[1], 10);
  if (!Number.isFinite(adults) || adults < 1) return null;
  const childMatch = text.match(/criancas?\s*:\s*(\d+)/i);
  const children = childMatch ? parseInt(childMatch[1], 10) : 0;
  const total = adults + (Number.isFinite(children) && children > 0 ? children : 0);
  return total > 0 ? total : null;
}

function extractGuestCountFromMessages(messages: ChatMessage[]): number | null {
  if (!conversationHasCompleteGuestComposition(messages)) return null;

  for (const m of messages) {
    if (m.role !== "user" || !m.content) continue;
    const fromForm = parseFormGuestCountFromText(m.content);
    if (fromForm != null) return fromForm;
  }

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

/** Categoria escolhida no formulário do site (ex.: "Chalé Aconchegante"). Null se o campo não veio. */
export function extractSunsetFormAccommodationFromMessages(messages: ChatMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user" && m.content)?.content ?? "";
  const m = firstUser.match(
    /acomoda[çc][ãa]o:\s*(.+?)(?=\s*check-in:|\s*check-out:|\s*total de noites:|\s*adultos:|\s*crian[çc]as:|$)/i
  );
  const raw = m?.[1]?.trim();
  return raw || null;
}

/** Incluir interest_keywords padrão (Loft) exceto quando o formulário já trouxe categoria específica. */
export function shouldIncludeDefaultLoftInterestKeywords(messages: ChatMessage[]): boolean {
  return !extractSunsetFormAccommodationFromMessages(messages);
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

/** Cliente aceitou receber orçamento ou pediu valor explicitamente. */
export function messageDeclaresLodgingQuoteReadiness(text: string): boolean {
  const t = normalizeText(text);
  return (
    /quanto fica|qual (o )?valor|quanto custa|quanto [eé]|passa(r)? (o )?(valor|pacote|orcamento)|manda(r)? (o )?(valor|pacote|orcamento)|quero ver (o )?(valor|pacote|orcamento)|me passa|pode passar|pode mandar|pode sim|^sim[,!.]?\s*(pode|quero|manda|passa|por favor)|^ok[,!.]?\s*(pode|manda|passa)|bora ver|manda ai|show[,!.]?\s*(pode|manda)|pode (sim|ser)|manda (ai|la)|quero (o |os )?(valor|orcamento|preco)|^certo$|^isso$|^pode ser$/.test(
      t
    )
  );
}

/** Pergunta sobre amenidade (SPA aquecido, tem TV…) — não é pedido de orçamento nem re-cotação. */
export function messageDeclaresLodgingAmenityFaq(text: string): boolean {
  const t = normalizeText(text);
  if (/quanto|valor|preco|tarifa|custa|or[cç]amento|manda(r)?\s+(o\s+)?(valor|pacote)/.test(t)) {
    return false;
  }
  if (/tem algum|tem alguma|gostei|saber mais|quero saber se tem|alguma suite|algum suite/.test(t)) {
    return false;
  }
  if (/(e|é|eh)\s+(aquecid|quente|frio|limpo|grande|pequen)/.test(t)) return true;
  if (/tem\s+(tv|frigobar|ar[\s-]?cond|wifi|secador|toalha|vista|varanda|hidro)/.test(t)) {
    return true;
  }
  if (/(como\s+(e|é)|como\s+funciona).*(spa|hidro|hidromassagem)/.test(t)) return true;
  if (/(spa|hidro|hidromassagem)\s+(e|é|eh)\s+/.test(t)) return true;
  return false;
}

export function conversationAlreadyDeliveredLodgingQuote(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "assistant" &&
      m.content &&
      /\bR\$\s*[\d.,]+/.test(m.content) &&
      (m.content.match(/R\$\s*[\d.,]+/g)?.length ?? 0) >= 2
  );
}

/**
 * Neste turno o dispatcher deve chamar consultar_hospedagem_sunset?
 * **Padrão: NÃO** (NO_TOOLS_NEEDED) — só allowlist explícita (economia de tokens).
 */
export function messageDeclaresLodgingPriceOrAvailabilityInquiry(text: string): boolean {
  const t = normalizeText(text);
  if (messageDeclaresLodgingQuoteReadiness(text)) return true;
  if (/faz(er)?\s+(um\s+)?or[cç]amento|fazer\s+or[cç]amento/.test(t)) return true;
  if (/or[cç]amento/.test(t) && /\d+\s+pessoas?/.test(t)) return true;
  if (
    /disponibilidade|tem vaga|verificar disponibilidade|quanto|valor|preco|tarifa|orcamento/.test(t) &&
    /hosped|hotel|chal|suite|loft|quarto|pernoite|diaria|pacote|acomoda|pessoas?/.test(t)
  ) {
    return true;
  }
  return false;
}

/** Índice da última mensagem do assistente com orçamento de hospedagem entregue (2+ preços). */
function lastAssistantDeliveredLodgingQuoteIndex(messages: ChatMessage[]): number {
  let last = -1;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    const priceCount = m.content.match(/R\$\s*[\d.,]+/g)?.length ?? 0;
    if (priceCount >= 2) last = i;
  }
  return last;
}

function previousAssistantDeliveredLodgingQuoteIndex(
  messages: ChatMessage[],
  beforeIndex: number,
): number {
  let last = -1;
  for (let i = 0; i < beforeIndex; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.content) continue;
    const priceCount = m.content.match(/R\$\s*[\d.,]+/g)?.length ?? 0;
    if (priceCount >= 2) last = i;
  }
  return last;
}

/**
 * Cliente inicia um **novo** pedido de orçamento (pode ser diferente do anterior no mesmo fio).
 */
export function messageDeclaresNewLodgingQuoteIntent(text: string): boolean {
  if (messageDeclaresLodgingPriceOrAvailabilityInquiry(text)) return true;
  const t = normalizeText(text);
  if (
    /outr[oa]\s+or[cç]amento|nov[oa]\s+or[cç]amento|nova\s+consulta|refaz(er)?\s+(o\s+)?or[cç]amento|outra\s+consulta/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /agora\s+(preciso|quero|vou\s+precisar|gostaria)/.test(t) &&
    /or[cç]amento|hosped|hotel|quarto|pacote|pessoas?|\d+\s+pessoas?/.test(t)
  ) {
    return true;
  }
  if (
    /na\s+verdade|mudou|alterou|troc(ar|ou)|mudei/.test(t) &&
    /or[cç]amento|hosped|\d+\s+pessoas?|\d{1,2}\/\d{1,2}|datas?|periodo/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Início da janela do orçamento **ativo** — ignora pedidos antigos no histórico longo.
 * Um ciclo = pedido + datas/composição + (possível) cotação; novo pedido abre outro ciclo.
 */
export function activeLodgingQuoteStartIndex(messages: ChatMessage[]): number {
  const lastQuoteIdx = lastAssistantDeliveredLodgingQuoteIndex(messages);
  const prevQuoteIdx =
    lastQuoteIdx >= 0 ? previousAssistantDeliveredLodgingQuoteIndex(messages, lastQuoteIdx) : -1;
  const cycleFloor = prevQuoteIdx + 1;

  const hasUserAfterLastQuote =
    lastQuoteIdx >= 0 &&
    messages.slice(lastQuoteIdx + 1).some((m) => m.role === "user" && m.content?.trim());

  if (hasUserAfterLastQuote) {
    for (let i = messages.length - 1; i > lastQuoteIdx; i--) {
      const m = messages[i];
      if (m.role === "user" && m.content?.trim() && messageDeclaresNewLodgingQuoteIntent(m.content)) {
        return i;
      }
    }
    // Correção de datas / follow-up no mesmo ciclo (ex.: recota após orçamento errado)
    return cycleFloor;
  }

  for (let i = (lastQuoteIdx >= 0 ? lastQuoteIdx : messages.length) - 1; i >= cycleFloor; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content?.trim() && messageDeclaresNewLodgingQuoteIntent(m.content)) {
      return i;
    }
  }
  return cycleFloor;
}

/** Mensagens relevantes para extrair datas/hóspedes do pedido de orçamento corrente. */
export function sliceActiveLodgingQuoteMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(activeLodgingQuoteStartIndex(messages));
}

/** Novo pedido após cotação anterior exige consulta fresca à tool (mesmo fio longo). */
export function lodgingQuoteNeedsFreshToolResult(messages: ChatMessage[]): boolean {
  if (lastAssistantDeliveredLodgingQuoteIndex(messages) < 0) return false;
  if (!conversationHasPendingLodgingQuote(messages)) return false;
  return extractSunsetLodgingParams(messages) != null;
}

/** Cliente informou data ou intervalo de estadia na mensagem. */
export function messageDeclaresExplicitLodgingDates(text: string, ref: Date = new Date()): boolean {
  if (parseDayAndSlashDateRangeIso(text, ref)) return true;
  if (parseExplicitDateIso(text, ref)) return true;
  const t = normalizeText(text);
  return (
    /\b(?:de|do|dia)\s+\d{1,2}\/\d{1,2}\s+(?:a|ao|ate)\s+\d{1,2}\/\d{1,2}\b/.test(t) ||
    /\b\d{1,2}\/\d{1,2}\s+(?:a|ao|ate)\s+\d{1,2}\/\d{1,2}\b/.test(t) ||
    /\b(?:para\s+o\s+)?(?:dia\s+)?\d{1,2}\s+e\s+\d{1,2}\/\d{1,2}\b/.test(t)
  );
}

function threadDeclaresLodgingQuoteRequest(
  userTexts: string[],
  contextMessages: ChatMessage[],
): boolean {
  if (userTexts.length === 0) return false;

  if (userTexts.some((t) => messageDeclaresNewLodgingQuoteIntent(t))) return true;

  const joined = normalizeText(userTexts.join(" "));
  if (/faz(er)?\s+(um\s+)?or[cç]amento|fazer\s+or[cç]amento|or[cç]amento\s+para/.test(joined)) {
    return true;
  }
  if (/or[cç]amento/.test(joined) && /\d+\s+pessoas?/.test(joined)) return true;
  if (
    /\d+\s+pessoas?/.test(joined) &&
    contextMessages.some(
      (m) =>
        m.role === "assistant" &&
        /qual\s+periodo|para\s+qual\s+periodo|quais?\s+datas|check-in|data\s+(de\s+)?check|quando\s+(vem|pretende)|periodo\s+voce/.test(
          normalizeText(m.content ?? ""),
        ),
    )
  ) {
    return true;
  }
  if (
    /quanto\s+(fica|custa)|qual\s+(o\s+)?valor/.test(joined) &&
    /hosped|hotel|quarto|acomoda|pernoite/.test(joined)
  ) {
    return true;
  }
  return false;
}

/** Thread já teve pedido explícito de orçamento/valor de hospedagem (qualquer turno). */
export function conversationHadLodgingQuoteRequest(messages: ChatMessage[]): boolean {
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  const userTexts = scoped.filter((m) => m.role === "user" && m.content).map((m) => m.content!);
  return threadDeclaresLodgingQuoteRequest(userTexts, scoped);
}

/**
 * Orçamento de hospedagem em andamento.
 * Considera só mensagens do cliente **após** o último orçamento entregue (sandbox longo).
 */
export function conversationHasPendingLodgingQuote(messages: ChatMessage[]): boolean {
  const lastQuoteIdx = lastAssistantDeliveredLodgingQuoteIndex(messages);
  const contextFrom = lastQuoteIdx >= 0 ? messages.slice(lastQuoteIdx + 1) : messages;
  const userTextsAfterQuote = contextFrom
    .filter((m) => m.role === "user" && m.content)
    .map((m) => m.content!);

  if (lastQuoteIdx >= 0) {
    if (userTextsAfterQuote.length === 0) return false;

    const lastAfter = userTextsAfterQuote[userTextsAfterQuote.length - 1] ?? "";
    const cycleStart = activeLodgingQuoteStartIndex(messages);
    const cycleMessages = messages.slice(cycleStart);

    if (messageDeclaresExplicitLodgingDates(lastAfter)) {
      if (threadDeclaresLodgingQuoteRequest(userTextsAfterQuote, contextFrom)) return true;
      const cycleUserTexts = cycleMessages
        .filter((m) => m.role === "user" && m.content)
        .map((m) => m.content!);
      if (threadDeclaresLodgingQuoteRequest(cycleUserTexts, cycleMessages)) return true;
    }

    return threadDeclaresLodgingQuoteRequest(userTextsAfterQuote, contextFrom);
  }

  return threadDeclaresLodgingQuoteRequest(
    messages.filter((m) => m.role === "user" && m.content).map((m) => m.content!),
    messages,
  );
}

export function userNeedsSunsetLodgingToolCall(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content);
  if (!lastUser?.content) return false;

  if (messageDeclaresLodgingAmenityFaq(lastUser.content)) return false;

  if (conversationHasPendingLodgingQuote(messages) && extractSunsetLodgingParams(messages) != null) {
    return true;
  }

  if (messageDeclaresLodgingQuoteReadiness(lastUser.content)) return true;

  if (messageDeclaresDateCorrection(lastUser.content)) return true;

  const t = normalizeText(lastUser.content);
  if (
    /quanto\s+(fica|custa|e)|qual\s+(o\s+)?valor|disponibilidade|tem vaga/.test(t) &&
    /hosped|hotel|quarto|loft|chal|suite|acomoda|pernoite|diaria|pacote/.test(t)
  ) {
    return extractSunsetLodgingParams(messages) != null;
  }

  if (
    extractSunsetLodgingParams(messages) != null &&
    messageDeclaresExplicitLodgingDates(lastUser.content) &&
    conversationHadLodgingQuoteRequest(messages)
  ) {
    return true;
  }

  if (conversationAlreadyDeliveredLodgingQuote(messages)) {
    return userAsksSunsetLodgingCategoryOrPrice(messages);
  }

  if (messageDeclaresLodgingPriceOrAvailabilityInquiry(lastUser.content)) {
    return extractSunsetLodgingParams(messages) != null;
  }

  return false;
}

/** Auto-invoke no runtime quando params completos e o fio exige cotação real. */
export function shouldAutoInvokeSunsetLodgingTool(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content);
  if (lastUser?.content && messageDeclaresLodgingAmenityFaq(lastUser.content)) return false;
  if (lastUser?.content && userMessageIsPhotoRequestOnly(lastUser.content)) return false;
  if (shouldBlockSunsetLodgingToolCall(messages)) return false;
  if (extractSunsetLodgingParams(messages) == null) return false;
  return userNeedsSunsetLodgingToolCall(messages);
}

/** Bloqueia consultar_hospedagem_sunset quando composição (crianças/idades) ou params estão incompletos. */
export function shouldBlockSunsetLodgingToolCall(messages: ChatMessage[]): boolean {
  if (conversationNeedsChildAgesConfirmation(messages)) return true;
  if (conversationNeedsChildrenConfirmation(messages)) return true;
  return extractSunsetLodgingParams(messages) == null;
}

export function getSunsetLodgingToolBlockInstruction(messages: ChatMessage[]): string {
  if (conversationNeedsChildAgesConfirmation(messages)) {
    return "Composição incompleta: falta idade das crianças. Pergunte quantos anos tem cada criança. PROIBIDO citar preços ou listar categorias neste turno.";
  }
  if (conversationNeedsChildrenConfirmation(messages)) {
    return 'Composição incompleta: falta confirmar crianças. Pergunte: "Alguma criança vai junto? Se sim, quantas e com quantos anos?" PROIBIDO citar preços ou listar categorias neste turno.';
  }
  return "Faltam datas ou composição completa para cotar hospedagem. PROIBIDO citar preços ou listar categorias neste turno.";
}

/** Pedido só de fotos/galeria — não re-cotar hospedagem nem tratar como pergunta de preço. */
export function userMessageIsPhotoRequestOnly(text: string): boolean {
  if (!userLikelyAskedForPhotos(text)) return false;
  const t = normalizeText(text);
  return !/quanto\s+(fica|custa|e)|qual\s+(o\s+)?valor|preco|tarifa|or[cç]amento/.test(t);
}

/** Cliente pergunta tarifa/detalhe de categoria específica (loft, hidro, suíte…). */
export function userAsksSunsetLodgingCategoryOrPrice(messages: ChatMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return false;
  const text = lastUser.content;
  if (messageDeclaresLodgingAmenityFaq(text)) return false;
  if (userMessageIsPhotoRequestOnly(text)) return false;
  if (detectSunsetLodgingInterestKeywords(text).length > 0) return true;
  const t = normalizeText(text);
  const asksPrice = /quanto\s+(fica|custa|e)|valor|preco|tarifa/.test(t);
  const aboutLodging = /hosped|acomoda|quarto|suite|loft|spa|hidro|hidromassagem/.test(t);
  const asksOption = /tem algum|tem alguma|gostei|saber mais|detalhe/.test(t);
  return (asksPrice && aboutLodging) || (asksOption && aboutLodging);
}

/** Reconsultar quando a categoria pedida não consta no último resultado da tool. */
export function shouldReinvokeSunsetLodging(messages: ChatMessage[], toolContents: string[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content) return false;
  if (messageDeclaresLodgingAmenityFaq(lastUser.content)) return false;

  if (!userAsksSunsetLodgingCategoryOrPrice(messages)) return false;

  if (toolContents.length === 0) return true;

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
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  if (scoped.length === 0) return null;

  const check_in = extractCheckInFromMessages(scoped, referenceDate);
  if (!check_in) return null;

  const check_out = extractCheckOutFromMessages(scoped, check_in, referenceDate);
  if (!check_out || check_out <= check_in) return null;

  const guestCount = extractGuestCountFromMessages(scoped);
  if (guestCount == null || guestCount < 1) return null;

  if (!conversationHasCompleteGuestComposition(scoped)) return null;

  const guests: SunsetLodgingGuest[] = buildSunsetLodgingGuests(scoped, guestCount);

  const lastUser = [...scoped].reverse().find((m) => m.role === "user");
  let interest_keywords = lastUser?.content
    ? detectSunsetLodgingInterestKeywords(lastUser.content)
    : [];

  if (interest_keywords.length === 0 && shouldIncludeDefaultLoftInterestKeywords(scoped)) {
    interest_keywords = [...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS];
  }

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
  if (/\b(?:uma|duas|tres|tr[eê]s|\d{1,2})\s+de\s+\d{1,2}(?:\s+anos?)?\b/i.test(text)) return true;
  if (/\d+\s+mes(es)?/.test(normalizeText(text))) return true;
  return false;
}

/** Cliente disse que há criança(s), sem declarar ausência. */
export function messageMentionsChildren(text: string, messages: ChatMessage[] = []): boolean {
  if (messageDeclaresNoChildren(text)) return false;
  const t = normalizeText(text);

  const formChild = text.match(/criancas?\s*:\s*(\d+)/i);
  if (formChild && parseInt(formChild[1], 10) > 0) return true;

  if (/\d+\s+crianc|\b(uma|duas|tres|1|2|3)\s+crianc/.test(t)) return true;
  if (/\b(apenas|so)\s+(uma|duas|tres|quatro|\d+)\b/.test(t) && assistantAskedAboutChildren(messages)) return true;
  if (parseChildAgesFromText(text).length > 0 && assistantAskedAboutChildren(messages)) return true;
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
export function messageDeclaresGuestCompositionComplete(
  text: string,
  messages: ChatMessage[] = [],
): boolean {
  const t = normalizeText(text);

  const formChild = text.match(/criancas?\s*:\s*(\d+)/i);
  if (/adultos\s*:\s*\d/i.test(text) || formChild) {
    const childCount = formChild ? parseInt(formChild[1], 10) : 0;
    if (childCount === 0) return /adultos\s*:\s*\d/i.test(text);
    return messageDeclaresChildAges(text);
  }

  if (messageDeclaresNoChildren(text)) return true;

  if (messageDeclaresChildAges(text) && assistantAskedAboutChildren(messages)) return true;

  if (messageMentionsChildren(text, messages)) {
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
    if (messageDeclaresGuestCompositionComplete(text, messages)) return true;
  }

  const totalCount = extractTotalGuestCountFromScopedMessages(messages);
  if (totalCount != null && conversationDeclaresChildrenAnswerInThread(messages)) {
    return true;
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content);
  if (lastUser?.content && messageUsesVagueGuestCountOnly(lastUser.content, messages)) return false;

  return false;
}

/** Cliente confirmou criança(s) mas não informou idade(s). */
export function conversationNeedsChildAgesConfirmation(messages: ChatMessage[]): boolean {
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  const userMsgs = scoped.filter((m) => m.role === "user" && m.content);
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
    if (messageMentionsChildren(text, messages)) mentionedChildren = true;
    if (messageAffirmsChildrenWithoutAges(text, scoped)) mentionedChildren = true;
    if (messageDeclaresChildAges(text)) hasAges = true;
  }

  return mentionedChildren && !hasAges;
}

/** Já sabe quantas pessoas, mas falta confirmar crianças (ex.: respondeu só "3"). */
export function conversationNeedsChildrenConfirmation(messages: ChatMessage[]): boolean {
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  if (scoped.length === 0) return false;
  if (conversationHasCompleteGuestComposition(scoped)) return false;
  if (conversationNeedsChildAgesConfirmation(messages)) return false;

  const hasGuestCount = scoped.some(
    (m) => m.role === "user" && m.content && resolveGuestCountFromAnswer(m.content, scoped) != null,
  );
  if (!hasGuestCount) return false;

  return !conversationDeclaresChildrenAnswerInThread(scoped);
}

export function conversationHasDeclaredGuestCount(messages: ChatMessage[]): boolean {
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  return (
    conversationNeedsChildrenConfirmation(messages) ||
    conversationHasCompleteGuestComposition(scoped)
  );
}

/** Resposta padrão quando falta confirmar crianças no pedido de orçamento ativo. */
export function buildSunsetChildrenConfirmationReply(messages: ChatMessage[]): string {
  const scoped = sliceActiveLodgingQuoteMessages(messages);
  let count: number | null = null;
  for (const m of [...scoped].reverse()) {
    if (m.role !== "user" || !m.content) continue;
    count = resolveGuestCountFromAnswer(m.content, scoped);
    if (count != null) break;
  }
  const label = count != null ? `${count} pessoas` : "esse grupo";
  return `Perfeito, ${label}! Alguma criança vai junto? Se sim, quantas e com quantos anos?`;
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
