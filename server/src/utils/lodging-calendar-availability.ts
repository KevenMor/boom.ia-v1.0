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
  // Mutações / listagem não são check de disponibilidade
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
    a === "reschedule"
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

