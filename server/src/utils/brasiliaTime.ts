/**
 * Utilitários para horário de Brasília (America/Sao_Paulo).
 * Usado por follow-ups e reminders para evitar bugs de timezone (servidor em UTC).
 */

const TZ = "America/Sao_Paulo";

/** JS weekday: 0=domingo … 6=sábado (calendário civil Brasília). */
export type BrasiliaWeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const WEEKDAY_SHORT_TO_INDEX: Record<string, BrasiliaWeekdayIndex> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_LABELS_PT: Record<BrasiliaWeekdayIndex, string> = {
  0: "domingo",
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
};

/** Retorna a hora atual (0–23) em Brasília. */
export function getBrasiliaHour(now: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(s, 10) || 0;
}

/** Retorna minuto atual (0–59) em Brasília. */
export function getBrasiliaMinute(now: Date = new Date()): number {
  const s = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    minute: "numeric",
  }).format(now);
  return parseInt(s, 10) || 0;
}

/** Retorna data atual em Brasília (YYYY-MM-DD). */
export function getBrasiliaDateStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Soma dias a um YYYY-MM-DD civil (mantém o calendário; meio-dia UTC). */
export function addDaysToIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dia da semana de um YYYY-MM-DD (0=dom … 6=sáb). */
export function getIsoWeekdayIndex(iso: string): BrasiliaWeekdayIndex {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() as BrasiliaWeekdayIndex;
}

/** Dia da semana atual em Brasília (0=dom … 6=sáb). */
export function getBrasiliaWeekdayIndex(now: Date = new Date()): BrasiliaWeekdayIndex {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(now);
  return WEEKDAY_SHORT_TO_INDEX[short] ?? getIsoWeekdayIndex(getBrasiliaDateStr(now));
}

/**
 * Próxima ocorrência de `targetDow` no calendário de Brasília.
 * `includeToday`: se hoje já é o dia, retorna hoje; senão o próximo.
 * Use `includeToday: false` para "próximo sábado" quando hoje já é sábado (+7).
 */
export function brasiliaUpcomingWeekdayIso(
  targetDow: BrasiliaWeekdayIndex,
  now: Date = new Date(),
  opts: { includeToday?: boolean } = {}
): string {
  const includeToday = opts.includeToday !== false;
  const today = getBrasiliaDateStr(now);
  const todayDow = getIsoWeekdayIndex(today);
  let delta = (targetDow - todayDow + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDaysToIsoDate(today, delta);
}

function normalizePtDateText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const WEEKDAY_PATTERNS: Array<{ re: RegExp; dow: BrasiliaWeekdayIndex }> = [
  { re: /\bdomingo\b/, dow: 0 },
  { re: /\bsegunda(?:\s*-?\s*feira)?\b/, dow: 1 },
  { re: /\bterca(?:\s*-?\s*feira)?\b/, dow: 2 },
  { re: /\bquarta(?:\s*-?\s*feira)?\b/, dow: 3 },
  { re: /\bquinta(?:\s*-?\s*feira)?\b/, dow: 4 },
  { re: /\bsexta(?:\s*-?\s*feira)?\b/, dow: 5 },
  { re: /\bsabado\b/, dow: 6 },
];

/** True se o texto cita um dia da semana em português. */
export function mentionsPortugueseWeekday(text: string): boolean {
  const t = normalizePtDateText(text);
  return WEEKDAY_PATTERNS.some(({ re }) => re.test(t));
}

/**
 * Resolve "sábado agora", "esse sábado", "próxima sexta", etc. → YYYY-MM-DD (Brasília).
 * Prioridade sobre "agora" = hoje: "sábado agora" NÃO é hoje.
 */
export function parsePortugueseWeekdayMention(
  text: string,
  now: Date = new Date()
): string | null {
  const t = normalizePtDateText(text);
  const hit = WEEKDAY_PATTERNS.find(({ re }) => re.test(t));
  if (!hit) return null;

  const nextWeekIntent =
    /\bproxim[oa]\b|\bque\s+vem\b|\bsemana\s+que\s+vem\b/.test(t) &&
    !/\b(esse|este|nessa|neste|agora)\b/.test(t);

  return brasiliaUpcomingWeekdayIso(hit.dow, now, { includeToday: !nextWeekIntent });
}

/** Linha auxiliar: próximos 7 dias úteis nomeados (inclui hoje). */
export function formatBrasiliaUpcomingWeekdays(now: Date = new Date()): string {
  const today = getBrasiliaDateStr(now);
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDaysToIsoDate(today, i);
    const label = WEEKDAY_LABELS_PT[getIsoWeekdayIndex(iso)];
    parts.push(`${label}=${iso}`);
  }
  return parts.join(", ");
}

export type BrasiliaGreetingPeriod = "bom_dia" | "boa_tarde" | "boa_noite";

/** Faixas: Bom dia 05:00–11:59 | Boa tarde 12:00–17:59 | Boa noite 18:00–04:59 */
export function getBrasiliaGreetingPeriod(now: Date = new Date()): BrasiliaGreetingPeriod {
  const h = getBrasiliaHour(now);
  if (h >= 5 && h <= 11) return "bom_dia";
  if (h >= 12 && h <= 17) return "boa_tarde";
  return "boa_noite";
}

export function formatBrasiliaGreeting(period: BrasiliaGreetingPeriod): string {
  switch (period) {
    case "bom_dia":
      return "Bom dia!";
    case "boa_tarde":
      return "Boa tarde!";
    case "boa_noite":
      return "Boa noite!";
  }
}

/** Bloco [CONTEXTO TEMPORAL] injetado no system prompt dos agentes. */
export function buildBrasiliaTemporalContext(now: Date = new Date()): string {
  const nowStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const todayISO = getBrasiliaDateStr(now);
  const tomorrowISO = getBrasiliaTomorrowStr(now);
  const greeting = formatBrasiliaGreeting(getBrasiliaGreetingPeriod(now));
  const weekMap = formatBrasiliaUpcomingWeekdays(now);

  return (
    `\n\n[CONTEXTO TEMPORAL] Agora: ${nowStr} (Brasília / America/Sao_Paulo). ` +
    `Hoje: ${todayISO}. Amanhã: ${tomorrowISO}. ` +
    `Próximos 7 dias (use para "sábado", "domingo", "próxima sexta" etc.): ${weekMap}. ` +
    `Saudação recomendada neste horário: ${greeting} ` +
    `Faixas: Bom dia 05:00–11:59 | Boa tarde 12:00–17:59 | Boa noite 18:00–04:59. ` +
    `Use APENAS estas datas (fuso Brasília) ao falar de "hoje", "amanhã", "sábado agora", dias da semana. ` +
    `PROIBIDO inventar dia da semana para uma data ou inverter (ex.: chamar domingo de sábado). ` +
    `Não replique cegamente a saudação do cliente se ela estiver errada para o horário atual.`
  );
}

/** Retorna data de amanhã em Brasília (YYYY-MM-DD). */
export function getBrasiliaTomorrowStr(now: Date = new Date()): string {
  const today = getBrasiliaDateStr(now);
  const [y, m, d] = today.split("-").map(Number);
  // 00:00 Brasília = 03:00 UTC
  const tomorrowMidnightBR = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrowMidnightBR);
}

/**
 * Verifica se a hora atual (Brasília) está dentro do horário de silêncio.
 * quietStart e quietEnd em 0–23. Ex.: 22–8 = silêncio das 22h às 07h59.
 */
export function isInQuietHours(
  quietStart: number,
  quietEnd: number,
  now: Date = new Date()
): boolean {
  const h = getBrasiliaHour(now);
  if (quietStart > quietEnd) {
    return h >= quietStart || h < quietEnd;
  }
  return h >= quietStart && h < quietEnd;
}

/**
 * Calcula o próximo horário fora do silêncio, mantendo o mesmo minuto.
 * Ex.: quiet 22–8, scheduled 21:10, agora 23:00 → retorna amanhã 08:10 Brasília (ISO).
 */
export function getNextSlotOutsideQuietHours(
  quietStart: number,
  quietEnd: number,
  scheduledAt: string,
  now: Date = new Date()
): string {
  const scheduled = new Date(scheduledAt);
  const minute = scheduled.getUTCMinutes();
  const h = getBrasiliaHour(now);

  let targetYmd: string;
  if (h >= quietStart) {
    targetYmd = getBrasiliaTomorrowStr(now);
  } else {
    targetYmd = getBrasiliaDateStr(now);
  }

  const [y, m, d] = targetYmd.split("-").map(Number);
  // 08:XX Brasília = 11:XX UTC (Brasília UTC-3)
  const utcHour = quietEnd + 3;
  const utcDate = new Date(Date.UTC(y, m - 1, d, utcHour, minute, 0, 0));
  return utcDate.toISOString();
}
