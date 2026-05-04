/**
 * Horário de funcionamento do agente (config em agents.config).
 * Fuso: America/Sao_Paulo (paridade com follow-ups / brasiliaTime).
 */

import { getBrasiliaHour, getBrasiliaMinute } from "./brasiliaTime.js";

const TZ = "America/Sao_Paulo";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export type BusinessHours = Record<DayKey, DaySchedule>;

const WEEKDAY_LONG_TO_KEY: Record<string, DayKey> = {
  Monday: "mon",
  Tuesday: "tue",
  Wednesday: "wed",
  Thursday: "thu",
  Friday: "fri",
  Saturday: "sat",
  Sunday: "sun",
};

/** HH:mm → minutos desde meia-noite [0, 1439]; inválido → null */
export function parseTimeToMinutes(value: string): number | null {
  const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59 || h < 0 || min < 0) return null;
  return h * 60 + min;
}

function getBrasiliaDayKey(now: Date): DayKey {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
  }).format(now);
  return WEEKDAY_LONG_TO_KEY[long] ?? "mon";
}

function prevDayKey(day: DayKey): DayKey {
  const idx = DAY_KEYS.indexOf(day);
  return DAY_KEYS[(idx - 1 + 7) % 7];
}

function minutesSinceMidnightBr(now: Date): number {
  return getBrasiliaHour(now) * 60 + getBrasiliaMinute(now);
}

function getSchedule(config: Record<string, unknown>, day: DayKey): DaySchedule | null {
  const bh = config.business_hours;
  if (!bh || typeof bh !== "object") return null;
  const row = (bh as Record<string, unknown>)[day];
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") return null;
  return {
    enabled: o.enabled,
    start: typeof o.start === "string" ? o.start : "00:00",
    end: typeof o.end === "string" ? o.end : "00:00",
  };
}

/** `agents.config.business_hours_enabled` vindo do JSON/PostgREST às vezes não é boolean estrito. */
export function isAgentBusinessHoursFeatureEnabled(config: Record<string, unknown>): boolean {
  const v = config.business_hours_enabled;
  if (v === true) return true;
  if (v === 1) return true;
  if (typeof v === "string" && v.trim().toLowerCase() === "true") return true;
  return false;
}

/**
 * Quando `business_hours_enabled` é falso, retorna true (nenhuma restrição).
 * Com habilitado, avalia a grade `business_hours` em Brasília.
 */
export function isWithinAgentBusinessHours(config: Record<string, unknown>, now: Date = new Date()): boolean {
  if (!isAgentBusinessHoursFeatureEnabled(config)) return true;
  return isWithinScheduledBusinessHours(config, now);
}

/** Avalia só a grade; não olha `business_hours_enabled`. */
export function isWithinScheduledBusinessHours(config: Record<string, unknown>, now: Date = new Date()): boolean {
  const todayKey = getBrasiliaDayKey(now);
  const minutesNow = minutesSinceMidnightBr(now);
  const prevKey = prevDayKey(todayKey);

  const prevSched = getSchedule(config, prevKey);
  if (prevSched?.enabled) {
    const s = parseTimeToMinutes(prevSched.start);
    const e = parseTimeToMinutes(prevSched.end);
    if (s != null && e != null && s > e && minutesNow < e) return true;
  }

  const todaySched = getSchedule(config, todayKey);
  if (!todaySched?.enabled) return false;

  const start = parseTimeToMinutes(todaySched.start);
  const end = parseTimeToMinutes(todaySched.end);
  if (start == null || end == null) return false;

  if (start <= end) {
    return minutesNow >= start && minutesNow < end;
  }
  return minutesNow >= start;
}

/**
 * Próximo instante (ISO UTC) em que o agente entra em horário permitido.
 * Só faz sentido com horário de trabalho ativado (`isAgentBusinessHoursFeatureEnabled`); se desabilitado, retorna null.
 * Se não achar janela em 8 dias, retorna null.
 */
export function getNextBusinessHoursOpenIso(
  config: Record<string, unknown>,
  from: Date = new Date()
): string | null {
  if (!isAgentBusinessHoursFeatureEnabled(config)) return null;

  const startMs = from.getTime() + 60_000;
  const limitMs = from.getTime() + 8 * 24 * 60 * 60 * 1000;

  for (let t = startMs; t <= limitMs; t += 60_000) {
    const d = new Date(t);
    if (isWithinScheduledBusinessHours(config, d)) {
      return d.toISOString();
    }
  }
  return null;
}
