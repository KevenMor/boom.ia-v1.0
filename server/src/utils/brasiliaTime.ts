/**
 * Utilitários para horário de Brasília (America/Sao_Paulo).
 * Usado por follow-ups e reminders para evitar bugs de timezone (servidor em UTC).
 */

const TZ = "America/Sao_Paulo";

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
