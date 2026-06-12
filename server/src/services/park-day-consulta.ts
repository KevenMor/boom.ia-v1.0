import type { createNexusClient } from "./supabase.js";
import { isTenantModuleEnabled } from "./tenant-modules.js";

export type ParkTicketLine = { label: string; value: string };

export type ParkDayConsultaResult =
  | {
      status: "success";
      date: string;
      day_kind: "aberto" | "fechado" | "manutencao";
      event_label: string | null;
      park_open: boolean;
      ticket_lines: ParkTicketLine[];
      message: string;
    }
  | {
      status: "no_data";
      date: string;
      message: string;
    };

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

export async function runParkDayConsulta(
  supabase: ReturnType<typeof createNexusClient>,
  params: { tenant_id: string; date: string }
): Promise<{ ok: true; data: ParkDayConsultaResult } | { ok: false; status: number; body: Record<string, unknown> }> {
  const tenant_id = params.tenant_id.trim();
  const date = params.date.trim();

  if (!tenant_id) {
    return { ok: false, status: 400, body: { error: "tenant_id required" } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, status: 400, body: { error: "invalid_date", detail: date } };
  }

  const hospedagemEnabled = await isTenantModuleEnabled(supabase, tenant_id, "hospedagem");
  if (!hospedagemEnabled) {
    return { ok: false, status: 403, body: { error: "module_disabled", detail: "hospedagem" } };
  }

  try {
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

    return {
      ok: true,
      data: {
        status: "success",
        date,
        day_kind: day_kind as "aberto" | "fechado" | "manutencao",
        event_label,
        park_open,
        ticket_lines,
        message: buildSuccessMessage(date, day_kind, event_label, ticket_lines),
      },
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 500, body: { error: "park_day_consulta_failed", detail } };
  }
}
