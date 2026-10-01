/**
 * Disponibilidade de hospedagem (diárias) via eventos do calendário.
 * Usado pelo Divino Chalé / calendar_query — NÃO confundir com slots horários de consultório.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type LodgingStay = { checkIn: string; checkOut: string };

export type LodgingCalendarEvent = {
  id?: string;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean | null;
};

/** Extrai check-in / check-out (YYYY-MM-DD) dos args da tool. */
export function parseLodgingStayArgs(args: Record<string, unknown>): LodgingStay | null {
  const rawIn = String(
    args.check_in ?? args.data_entrada ?? args.checkin ?? args.entrada ?? args.date_in ?? "",
  ).trim();
  const rawOut = String(
    args.check_out ?? args.data_saida ?? args.checkout ?? args.saida ?? args.date_out ?? "",
  ).trim();

  let checkIn = rawIn.slice(0, 10);
  let checkOut = rawOut.slice(0, 10);

  // Uma noite: só "date" / "data"
  if (!ISO_DATE.test(checkIn)) {
    const single = String(args.date ?? args.data ?? "").trim().slice(0, 10);
    if (ISO_DATE.test(single)) {
      checkIn = single;
      if (!ISO_DATE.test(checkOut)) {
        checkOut = addDaysIso(single, 1);
      }
    }
  }

  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return null;
  if (checkOut <= checkIn) {
    checkOut = addDaysIso(checkIn, 1);
  }
  return { checkIn, checkOut };
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Período da estadia em ms (check-in 00:00 BRT → check-out 00:00 BRT, exclusive end). */
export function lodgingStayWindowMs(stay: LodgingStay): { startMs: number; endMs: number } {
  return {
    startMs: new Date(`${stay.checkIn}T00:00:00-03:00`).getTime(),
    endMs: new Date(`${stay.checkOut}T00:00:00-03:00`).getTime(),
  };
}

export function eventOverlapsStay(ev: LodgingCalendarEvent, stay: LodgingStay): boolean {
  if (!ev.start_at) return false;
  const { startMs, endMs } = lodgingStayWindowMs(stay);
  const evStart = new Date(ev.start_at).getTime();
  if (Number.isNaN(evStart)) return false;
  const evEndRaw = ev.end_at ? new Date(ev.end_at).getTime() : NaN;
  // all-day / sem end: assume 1 dia a partir do start
  const evEnd = !Number.isNaN(evEndRaw)
    ? evEndRaw
    : evStart + 24 * 60 * 60 * 1000;
  return evStart < endMs && evEnd > startMs;
}

export function findLodgingConflicts(
  events: LodgingCalendarEvent[],
  stay: LodgingStay,
): LodgingCalendarEvent[] {
  return events.filter((ev) => eventOverlapsStay(ev, stay));
}

/** Prefere agendas de chalé/hospedagem; se não houver match, usa todas. */
export function pickLodgingCalendars<T extends { id: string; name?: string | null }>(
  calendars: T[],
): T[] {
  const lodging = calendars.filter((c) =>
    /chal[eé]|hosped|reserv|divino/i.test(c.name || ""),
  );
  return lodging.length > 0 ? lodging : calendars;
}

export function isLodgingAvailabilityAction(action: string, args: Record<string, unknown>): boolean {
  const a = action.toLowerCase();
  // Mutações / listagem / sugestão em lote não são check de UMA diária
  if (
    a === "cancelar" ||
    a === "cancel" ||
    a === "delete" ||
    a === "excluir" ||
    a === "remover" ||
    a === "criar" ||
    a === "create" ||
    a === "listar_eventos" ||
    a === "list_events" ||
    a === "reagendar" ||
    a === "reschedule" ||
    isLodgingSuggestDatesAction(a)
  ) {
    return false;
  }
  if (
    a === "check_lodging" ||
    a === "verificar_hospedagem" ||
    a === "disponibilidade_hospedagem" ||
    a === "check_stay"
  ) {
    return true;
  }
  return parseLodgingStayArgs(args) !== null;
}

export function isLodgingDeleteAction(action: string): boolean {
  const a = action.toLowerCase();
  return a === "excluir" || a === "remover" || a === "cancelar" || a === "cancel" || a === "delete";
}

/** Uma chamada: próximas diárias livres (máx. 3). Evita o dispatcher varrer dia a dia. */
export function isLodgingSuggestDatesAction(action: string): boolean {
  const a = action.toLowerCase().trim();
  return (
    a === "sugerir_datas" ||
    a === "find_next" ||
    a === "find_next_available" ||
    a === "proximas_datas" ||
    a === "next_available"
  );
}

export type LodgingDatePreference = "any" | "weekend" | "weekday";

export type LodgingSuggestOptions = {
  fromDate: string;
  preference: LodgingDatePreference;
  limit: number;
  nights: number;
  searchDays: number;
};

export function parseLodgingSuggestArgs(args: Record<string, unknown>, todayIso: string): LodgingSuggestOptions {
  const rawFrom = String(args.from_date ?? args.a_partir_de ?? args.after_date ?? args.check_in ?? "").trim().slice(0, 10);
  const fromDate = ISO_DATE.test(rawFrom) ? rawFrom : todayIso;

  const prefRaw = String(args.preference ?? args.preferencia ?? args.periodo ?? "any")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let preference: LodgingDatePreference = "any";
  if (/fim|final|weekend|fds|sabad|sex/.test(prefRaw)) preference = "weekend";
  else if (/semana|weekday|util|meio/.test(prefRaw) && !/fim|final|weekend|fds/.test(prefRaw)) {
    preference = "weekday";
  }

  const limitRaw = Number(args.limit ?? args.max ?? args.quantidade ?? 3);
  const limit = Number.isFinite(limitRaw) ? Math.min(3, Math.max(1, Math.floor(limitRaw))) : 3;

  const nightsRaw = Number(args.nights ?? args.noites ?? 1);
  const nights = Number.isFinite(nightsRaw) ? Math.min(7, Math.max(1, Math.floor(nightsRaw))) : 1;

  const searchRaw = Number(args.search_days ?? args.dias_busca ?? 45);
  const searchDays = Number.isFinite(searchRaw) ? Math.min(90, Math.max(7, Math.floor(searchRaw))) : 45;

  return { fromDate, preference, limit, nights, searchDays };
}

/** Dow ISO YYYY-MM-DD (UTC noon): 0=dom … 6=sáb */
function isoWeekdayUtcNoon(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
}

function matchesLodgingPreference(checkInIso: string, preference: LodgingDatePreference): boolean {
  if (preference === "any") return true;
  const dow = isoWeekdayUtcNoon(checkInIso); // 0 Sun … 6 Sat
  // Preço fim de semana no chalé: sex–dom → check-in sex(5), sáb(6), dom(0)
  if (preference === "weekend") return dow === 5 || dow === 6 || dow === 0;
  // Durante a semana: seg–qui
  return dow >= 1 && dow <= 4;
}

export type SuggestedLodgingNight = { check_in: string; check_out: string };

/**
 * Varre no máximo `searchDays` noites a partir de fromDate e devolve até `limit` livres.
 * Preferência weekend/weekday filtra o dia de check-in.
 */
export function findNextAvailableLodgingNights(
  events: LodgingCalendarEvent[],
  opts: LodgingSuggestOptions,
): SuggestedLodgingNight[] {
  const out: SuggestedLodgingNight[] = [];
  for (let i = 0; i < opts.searchDays && out.length < opts.limit; i++) {
    const checkIn = addDaysIso(opts.fromDate, i);
    if (!matchesLodgingPreference(checkIn, opts.preference)) continue;
    const checkOut = addDaysIso(checkIn, opts.nights);
    const stay = { checkIn, checkOut };
    if (findLodgingConflicts(events, stay).length === 0) {
      out.push({ check_in: checkIn, check_out: checkOut });
    }
  }
  return out;
}

