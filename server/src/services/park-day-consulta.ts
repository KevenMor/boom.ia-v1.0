import type { createNexusClient } from "./supabase.js";
import { isTenantModuleEnabled } from "./tenant-modules.js";

export type ParkTicketLine = { label: string; value: string };

export type ParkDayEntry = {
  date: string;
  day_kind: "aberto" | "fechado" | "manutencao" | "no_data";
  park_open: boolean;
  event_label: string | null;
  ticket_lines: ParkTicketLine[];
};

export type ParkDayConsultaResult =
  | {
      status: "success";
      mode?: "single";
      date: string;
      day_kind: "aberto" | "fechado" | "manutencao";
      event_label: string | null;
      park_open: boolean;
      ticket_lines: ParkTicketLine[];
      message: string;
      next_open_date?: string;
    }
  | {
      status: "success";
      mode: "range";
      date_from: string;
      date_to: string;
      days: ParkDayEntry[];
      all_park_open: boolean;
      closed_dates: string[];
      open_dates: string[];
      message: string;
      next_open_date?: string;
    }
  | {
      status: "no_data";
      date: string;
      message: string;
    };

const MAX_RANGE_DAYS = 31;

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function enumerateIsoDateRange(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < MAX_RANGE_DAYS) {
    out.push(cur);
    if (cur === to) break;
    cur = addDaysIso(cur, 1);
  }
  return out;
}

function parseParkTicketLines(stored: string | null): ParkTicketLine[] {
  if (!stored?.trim()) return [];
  const t = stored.trim();
  if (!t.startsWith("[")) {
    return [{ label: "", value: t }];
  }
  try {
    const arr = JSON.parse(t) as unknown;
    if (!Array.isArray(arr)) return [{ label: "", value: t }];
    return arr
      .map((item) => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          return {
            label: typeof o.label === "string" ? o.label : "",
            value: typeof o.value === "string" ? o.value : "",
          };
        }
        if (typeof item === "string") return { label: "", value: item };
        return { label: "", value: "" };
      })
      .filter((line) => line.label.trim() || line.value.trim());
  } catch {
    return [{ label: "", value: t }];
  }
}

function dayKindLabel(kind: string): string {
  if (kind === "fechado") return "fechado";
  if (kind === "manutencao") return "em manutenção";
  if (kind === "no_data") return "sem registro";
  return "aberto";
}

function buildSuccessMessage(
  date: string,
  dayKind: string,
  eventLabel: string | null,
  ticketLines: ParkTicketLine[]
): string {
  const parts: string[] = [];
  parts.push(`Calendário do parque em ${date}: ${dayKindLabel(dayKind)}.`);
  if (eventLabel) parts.push(`Etiqueta do dia: ${eventLabel}.`);
  if (dayKind !== "aberto") {
    parts.push("O parque não está em operação normal nesta data.");
    return parts.join(" ");
  }
  if (ticketLines.length > 0) {
    const ticketText = ticketLines
      .map((l) => (l.label.trim() ? `${l.label.trim()}: ${l.value.trim()}` : l.value.trim()))
      .filter(Boolean)
      .join("; ");
    parts.push(`Valores de ingresso cadastrados: ${ticketText}.`);
  } else {
    parts.push("Não há valores de ingresso cadastrados para esta data no painel.");
  }
  return parts.join(" ");
}

type ParkDayRow = {
  calendar_date: string;
  day_kind: string;
  event_label: string | null;
  park_ticket_value: string | null;
};

export function buildParkDayEntry(date: string, row: ParkDayRow | undefined): ParkDayEntry {
  if (!row) {
    return {
      date,
      day_kind: "no_data",
      park_open: false,
      event_label: null,
      ticket_lines: [],
    };
  }
  const day_kind = (row.day_kind as "aberto" | "fechado" | "manutencao") ?? "aberto";
  const event_label =
    typeof row.event_label === "string" && row.event_label.trim() ? row.event_label.trim() : null;
  const ticket_lines = parseParkTicketLines(
    typeof row.park_ticket_value === "string" ? row.park_ticket_value : null
  );
  const park_open = day_kind === "aberto";
  return {
    date,
    day_kind,
    park_open,
    event_label,
    ticket_lines,
  };
}

export function buildParkRangeMessage(
  dateFrom: string,
  dateTo: string,
  days: ParkDayEntry[],
  closedDates: string[],
  openDates: string[]
): string {
  const parts: string[] = [
    `Calendário do parque de ${dateFrom} a ${dateTo} (${days.length} dia(s)):`,
  ];
  for (const d of days) {
    parts.push(`- ${d.date}: ${dayKindLabel(d.day_kind)}${d.park_open ? "" : " (parque não aberto)"}.`);
  }
  if (closedDates.length > 0) {
    parts.push(`Dias fechados ou sem operação normal: ${closedDates.join(", ")}.`);
  }
  if (openDates.length > 0) {
    parts.push(`Dias abertos: ${openDates.join(", ")}.`);
  }
  parts.push("Use SOMENTE estes dias ao responder — PROIBIDO afirmar abertura/fechamento de data não listada.");
  return parts.join(" ");
}

export async function runParkDayConsulta(
  supabase: ReturnType<typeof createNexusClient>,
  params: { tenant_id: string; date: string; date_to?: string }
): Promise<{ ok: true; data: ParkDayConsultaResult } | { ok: false; status: number; body: Record<string, unknown> }> {
  const tenant_id = params.tenant_id.trim();
  const date = params.date.trim();
  const date_to = params.date_to?.trim();

  if (!tenant_id) {
    return { ok: false, status: 400, body: { error: "tenant_id required" } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, status: 400, body: { error: "invalid_date", detail: date } };
  }
  if (date_to && !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
    return { ok: false, status: 400, body: { error: "invalid_date_to", detail: date_to } };
  }
  if (date_to && date_to < date) {
    return { ok: false, status: 400, body: { error: "date_to_before_date" } };
  }

  const hospedagemEnabled = await isTenantModuleEnabled(supabase, tenant_id, "hospedagem");
  if (!hospedagemEnabled) {
    return { ok: false, status: 403, body: { error: "module_disabled", detail: "hospedagem" } };
  }

  try {
    if (date_to && date_to !== date) {
      const dates = enumerateIsoDateRange(date, date_to);
      if (dates.length === 0) {
        return { ok: false, status: 400, body: { error: "invalid_range" } };
      }
      if (dates.length > MAX_RANGE_DAYS) {
        return {
          ok: false,
          status: 400,
          body: { error: "range_too_long", max_days: MAX_RANGE_DAYS },
        };
      }

      const { data: rows, error } = await supabase
        .from("lodging_park_days")
        .select("calendar_date, day_kind, event_label, park_ticket_value")
        .eq("tenant_id", tenant_id)
        .gte("calendar_date", date)
        .lte("calendar_date", date_to)
        .order("calendar_date", { ascending: true });

      if (error) throw error;

      const byDate = new Map((rows ?? []).map((r) => [r.calendar_date as string, r as ParkDayRow]));
      const days = dates.map((d) => buildParkDayEntry(d, byDate.get(d)));
      const closed_dates = days.filter((d) => !d.park_open).map((d) => d.date);
      const open_dates = days.filter((d) => d.park_open).map((d) => d.date);
      const all_park_open = closed_dates.length === 0;

      let next_open_date: string | undefined;
      if (!all_park_open) {
        const { data: futureDays } = await supabase
          .from("lodging_park_days")
          .select("calendar_date, day_kind")
          .eq("tenant_id", tenant_id)
          .gt("calendar_date", date_to)
          .order("calendar_date", { ascending: true })
          .limit(45);

        const nextOpen = futureDays?.find((d) => d.day_kind === "aberto");
        if (nextOpen?.calendar_date) {
          next_open_date = nextOpen.calendar_date;
        }
      }

      return {
        ok: true,
        data: {
          status: "success",
          mode: "range",
          date_from: date,
          date_to,
          days,
          all_park_open,
          closed_dates,
          open_dates,
          message: buildParkRangeMessage(date, date_to, days, closed_dates, open_dates),
          ...(next_open_date ? { next_open_date } : {}),
        },
      };
    }

    const { data: row, error } = await supabase
      .from("lodging_park_days")
      .select("calendar_date, day_kind, event_label, park_ticket_value")
      .eq("tenant_id", tenant_id)
      .eq("calendar_date", date)
      .maybeSingle();

    if (error) throw error;

    if (!row) {
      return {
        ok: true,
        data: {
          status: "no_data",
          date,
          message: `Não há registro no calendário do parque para ${date}. Oriente o cliente à área de ingressos em https://sunsetthermaspark.com.br/ sem inventar valores.`,
        },
      };
    }

    const day_kind = (row.day_kind as string) ?? "aberto";
    const event_label =
      typeof row.event_label === "string" && row.event_label.trim() ? row.event_label.trim() : null;
    const ticket_lines = parseParkTicketLines(
      typeof row.park_ticket_value === "string" ? row.park_ticket_value : null
    );
    const park_open = day_kind === "aberto";

    let next_open_date: string | undefined;
    if (!park_open) {
      const { data: futureDays } = await supabase
        .from("lodging_park_days")
        .select("calendar_date, day_kind")
        .eq("tenant_id", tenant_id)
        .gt("calendar_date", date)
        .order("calendar_date", { ascending: true })
        .limit(45);

      const nextOpen = futureDays?.find((d) => d.day_kind === "aberto");
      if (nextOpen?.calendar_date) {
        next_open_date = nextOpen.calendar_date;
      }
    }

    return {
      ok: true,
      data: {
        status: "success",
        mode: "single",
        date,
        day_kind: day_kind as "aberto" | "fechado" | "manutencao",
        event_label,
        park_open,
        ticket_lines,
        message: buildSuccessMessage(date, day_kind, event_label, ticket_lines),
        ...(next_open_date ? { next_open_date } : {}),
      },
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 500, body: { error: "park_day_consulta_failed", detail } };
  }
}
