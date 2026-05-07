import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

/** Tipo de funcionamento do parque no dia. */
export type LodgingParkDayKind = "aberto" | "fechado" | "manutencao";

/** Etiqueta comercial do dia (opcional). */
export type LodgingParkDayEventLabel = "promocional" | "evento" | "normal";
/** Registo de dia no calendário do parque (por tenant). */
export interface LodgingParkDay {
  id: string;
  tenant_id: string;
  calendar_date: string;
  day_kind: LodgingParkDayKind;
  /** Reservado para texto livre futuro; não usado na UI por agora. */
  lodging_rules: string | null;
  event_label: LodgingParkDayEventLabel | null;
  /** Ingressos: JSON `[{ "label": "…", "value": "…" }, …]` ou texto legado (uma linha). */
  park_ticket_value: string | null;
  created_at: string;
  updated_at: string;
}

const LEGACY_DAY_KIND_MAP: Record<string, LodgingParkDayKind> = {
  open_promotional: "aberto",
  open_standard: "aberto",
  special_event: "aberto",
  closed: "fechado",
  aberto: "aberto",
  fechado: "fechado",
  manutencao: "manutencao",
};

const MAX_PARK_TICKET_STORED = 4096;

/** Linha de ingresso no calendário (serializada em JSON em `park_ticket_value`). */
export type ParkTicketLine = { label: string; value: string };

/** Edição: pelo menos uma linha em branco para o utilizador preencher. */
export function parseParkTicketLines(stored: string | null): ParkTicketLine[] {
  if (!stored?.trim()) return [{ label: "", value: "" }];
  const t = stored.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (!Array.isArray(arr)) return [{ label: "", value: t }];
      const rows: ParkTicketLine[] = arr.map((item) => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const label = typeof o.label === "string" ? o.label : "";
          const value = typeof o.value === "string" ? o.value : "";
          return { label, value };
        }
        if (typeof item === "string") return { label: "", value: item };
        return { label: "", value: "" };
      });
      const nonEmpty = rows.filter((r) => r.label.trim() || r.value.trim());
      return nonEmpty.length > 0 ? nonEmpty : [{ label: "", value: "" }];
    } catch {
      return [{ label: "", value: t }];
    }
  }
  return [{ label: "", value: t }];
}

export function serializeParkTicketLines(lines: ParkTicketLine[]): string | null {
  const cleaned = lines
    .map((l) => ({ label: l.label.trim(), value: l.value.trim() }))
    .filter((l) => l.label || l.value);
  if (cleaned.length === 0) return null;
  let cur = [...cleaned];
  while (cur.length > 0 && JSON.stringify(cur).length > MAX_PARK_TICKET_STORED) {
    cur = cur.slice(0, -1);
  }
  if (cur.length === 0) return null;
  return JSON.stringify(cur);
}

/** Pré-visualização curta para células do calendário. */
export function formatParkTicketPreview(stored: string | null, maxLen = 72): string {
  const lines = parseParkTicketLines(stored).filter((l) => l.label.trim() || l.value.trim());
  if (lines.length === 0) return "";
  const parts = lines.map((l) =>
    l.label.trim() && l.value.trim() ? `${l.label.trim()}: ${l.value.trim()}` : (l.value.trim() || l.label.trim()),
  );
  const s = parts.join(" · ");
  return s.length > maxLen ? `${s.slice(0, Math.max(0, maxLen - 1))}…` : s;
}

function normalizeTicketValue(raw: unknown): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  return s.length > MAX_PARK_TICKET_STORED ? s.slice(0, MAX_PARK_TICKET_STORED) : s;
}

function normalizeParkDay(raw: LodgingParkDay): LodgingParkDay {
  const dk =
    LEGACY_DAY_KIND_MAP[raw.day_kind] ??
    (["aberto", "fechado", "manutencao"].includes(raw.day_kind as string)
      ? (raw.day_kind as LodgingParkDayKind)
      : "aberto");
  const ev = raw.event_label as string | null;
  const okEv =
    ev === "promocional" || ev === "evento" || ev === "normal"
      ? (ev as LodgingParkDayEventLabel)
      : null;
  const ticket = normalizeTicketValue((raw as { park_ticket_value?: unknown }).park_ticket_value);
  return { ...raw, day_kind: dk, event_label: okEv, park_ticket_value: ticket };
}

export interface LodgingAccommodationType {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  max_occupancy: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface LodgingUnit {
  id: string;
  tenant_id: string;
  accommodation_type_id: string;
  name: string;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
  lodging_accommodation_types?: { id: string; name: string } | null;
}

export interface LodgingReservation {
  id: string;
  tenant_id: string;
  unit_id: string;
  contact_id: string | null;
  check_in: string;
  check_out: string;
  status: "pending" | "confirmed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  lodging_units?: { id: string; name: string; accommodation_type_id: string } | null;
  contacts?: { id: string; name: string; phone: string | null } | null;
}

export const hospedagemKeys = {
  parkDays: (tenantId: string | null, y: number, m: number) => ["hospedagem", "park-days", tenantId, y, m] as const,
  types: (tenantId: string | null) => ["hospedagem", "accommodation-types", tenantId] as const,
  units: (tenantId: string | null, typeId?: string) => ["hospedagem", "units", tenantId, typeId ?? "all"] as const,
  reservations: (tenantId: string | null) => ["hospedagem", "reservations", tenantId] as const,
  availability: (tenantId: string | null, ci: string, co: string) =>
    ["hospedagem", "availability", tenantId, ci, co] as const,
};

export function useLodgingParkDays(tenantId: string | undefined, year: number, month: number) {
  return useQuery({
    queryKey: hospedagemKeys.parkDays(tenantId ?? null, year, month),
    enabled: !!tenantId,
    queryFn: async () => {
      const res = await callAPI<{ data: LodgingParkDay[] }>(
        `/hospedagem/park-days?tenant_id=${encodeURIComponent(tenantId!)}&year=${year}&month=${month}`,
        { method: "GET" },
      );
      return { ...res, data: (res.data ?? []).map((r) => normalizeParkDay(r)) };
    },
  });
}

export function useBulkUpsertParkDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tenant_id: string;
      days: Array<{
        calendar_date: string;
        day_kind: LodgingParkDayKind;
        event_label?: LodgingParkDayEventLabel | null;
        park_ticket_value?: string | null;
      }>;
    }) => callAPI<{ data: LodgingParkDay[]; upserted: number }>("/hospedagem/park-days/bulk", { method: "POST", body }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["hospedagem", "park-days", vars.tenant_id] });
    },
  });
}

export function useDeleteParkDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; tenant_id: string }) =>
      callAPI<{ ok: boolean }>(`/hospedagem/park-days/${vars.id}`, { method: "DELETE" }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["hospedagem", "park-days", vars.tenant_id] });
    },
  });
}

export function useLodgingAccommodationTypes(tenantId: string | undefined) {
  return useQuery({
    queryKey: hospedagemKeys.types(tenantId ?? null),
    enabled: !!tenantId,
    queryFn: () =>
      callAPI<{ data: LodgingAccommodationType[] }>(
        `/hospedagem/accommodation-types?tenant_id=${encodeURIComponent(tenantId!)}`,
        { method: "GET" }
      ),
  });
}

export function useCreateAccommodationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tenant_id: string;
      name: string;
      description?: string | null;
      max_occupancy?: number | null;
      display_order?: number;
    }) => callAPI<LodgingAccommodationType>("/hospedagem/accommodation-types", { method: "POST", body }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.types(vars.tenant_id) });
    },
  });
}

export function useUpdateAccommodationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; tenant_id: string; patch: Partial<Pick<LodgingAccommodationType, "name" | "description" | "max_occupancy" | "display_order">> }) =>
      callAPI<LodgingAccommodationType>(`/hospedagem/accommodation-types/${vars.id}`, {
        method: "PATCH",
        body: vars.patch,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.types(vars.tenant_id) });
    },
  });
}

export function useDeleteAccommodationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; tenant_id: string }) =>
      callAPI<{ ok: boolean }>(`/hospedagem/accommodation-types/${vars.id}`, { method: "DELETE" }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.types(vars.tenant_id) });
      void qc.invalidateQueries({ queryKey: ["hospedagem", "units", vars.tenant_id] });
    },
  });
}

export function useLodgingUnits(tenantId: string | undefined, accommodationTypeId?: string) {
  return useQuery({
    queryKey: hospedagemKeys.units(tenantId ?? null, accommodationTypeId),
    enabled: !!tenantId,
    queryFn: () => {
      const q = accommodationTypeId
        ? `&accommodation_type_id=${encodeURIComponent(accommodationTypeId)}`
        : "";
      return callAPI<{ data: LodgingUnit[] }>(
        `/hospedagem/units?tenant_id=${encodeURIComponent(tenantId!)}${q}`,
        { method: "GET" }
      );
    },
  });
}

export function useCreateLodgingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tenant_id: string;
      accommodation_type_id: string;
      name: string;
      status?: "active" | "inactive";
      notes?: string | null;
    }) => callAPI<LodgingUnit>("/hospedagem/units", { method: "POST", body }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["hospedagem", "units", vars.tenant_id] });
    },
  });
}

export function useUpdateLodgingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      tenant_id: string;
      patch: Partial<Pick<LodgingUnit, "name" | "status" | "notes" | "accommodation_type_id">>;
    }) => callAPI<LodgingUnit>(`/hospedagem/units/${vars.id}`, { method: "PATCH", body: vars.patch }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["hospedagem", "units", vars.tenant_id] });
    },
  });
}

export function useDeleteLodgingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; tenant_id: string }) =>
      callAPI<{ ok: boolean }>(`/hospedagem/units/${vars.id}`, { method: "DELETE" }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ["hospedagem", "units", vars.tenant_id] });
      void qc.invalidateQueries({ queryKey: hospedagemKeys.reservations(vars.tenant_id) });
    },
  });
}

export function useLodgingReservations(tenantId: string | undefined) {
  return useQuery({
    queryKey: hospedagemKeys.reservations(tenantId ?? null),
    enabled: !!tenantId,
    queryFn: () =>
      callAPI<{ data: LodgingReservation[] }>(
        `/hospedagem/reservations?tenant_id=${encodeURIComponent(tenantId!)}`,
        { method: "GET" }
      ),
  });
}

export function useLodgingAvailability(tenantId: string | undefined, checkIn: string, checkOut: string) {
  return useQuery({
    queryKey: hospedagemKeys.availability(tenantId ?? null, checkIn, checkOut),
    enabled: !!tenantId && !!checkIn && !!checkOut && checkOut > checkIn,
    queryFn: () =>
      callAPI<{
        check_in: string;
        check_out: string;
        units: Array<{ unit_id: string; name: string; accommodation_type_id: string; available: boolean }>;
      }>(
        `/hospedagem/availability?tenant_id=${encodeURIComponent(tenantId!)}&check_in=${encodeURIComponent(checkIn)}&check_out=${encodeURIComponent(checkOut)}`,
        { method: "GET" }
      ),
  });
}

export function useCreateLodgingReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tenant_id: string;
      unit_id: string;
      contact_id?: string | null;
      check_in: string;
      check_out: string;
      status?: "pending" | "confirmed" | "cancelled";
      notes?: string | null;
    }) => callAPI<LodgingReservation>("/hospedagem/reservations", { method: "POST", body }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.reservations(vars.tenant_id) });
    },
  });
}

export function useUpdateLodgingReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      tenant_id: string;
      patch: Partial<Pick<LodgingReservation, "check_in" | "check_out" | "status" | "notes" | "contact_id" | "unit_id">>;
    }) => callAPI<LodgingReservation>(`/hospedagem/reservations/${vars.id}`, { method: "PATCH", body: vars.patch }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.reservations(vars.tenant_id) });
    },
  });
}

export function useDeleteLodgingReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; tenant_id: string }) =>
      callAPI<{ ok: boolean }>(`/hospedagem/reservations/${vars.id}`, { method: "DELETE" }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: hospedagemKeys.reservations(vars.tenant_id) });
    },
  });
}
