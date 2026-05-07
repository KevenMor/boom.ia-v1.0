import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { isTenantModuleEnabled } from "../services/tenant-modules.js";
import {
  canAccessTenant,
  canManageTenant,
  requireAuthenticated,
} from "../services/authorization.js";
import { runLodgingConsulta } from "../services/lodging-consulta.js";

const MODULE_KEY = "hospedagem";

const DAY_KINDS = ["aberto", "fechado", "manutencao"] as const;
type DayKind = (typeof DAY_KINDS)[number];

const EVENT_LABELS = ["promocional", "evento", "normal"] as const;
type EventLabel = (typeof EVENT_LABELS)[number];

const RES_STATUSES = ["pending", "confirmed", "cancelled"] as const;
type ResStatus = (typeof RES_STATUSES)[number];

const UNIT_STATUSES = ["active", "inactive"] as const;

const MAX_PARK_TICKET_VALUE_LEN = 4096;

function parseParkTicketValue(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return s.length > MAX_PARK_TICKET_VALUE_LEN ? s.slice(0, MAX_PARK_TICKET_VALUE_LEN) : s;
}

function parseDayKind(raw: unknown): DayKind | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (DAY_KINDS as readonly string[]).includes(s) ? (s as DayKind) : null;
}

function parseEventLabel(raw: unknown): EventLabel | null {
  if (raw == null || raw === "") return null;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (EVENT_LABELS as readonly string[]).includes(s) ? (s as EventLabel) : null;
}

function parseResStatus(raw: unknown): ResStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (RES_STATUSES as readonly string[]).includes(s) ? (s as ResStatus) : null;
}

async function denyIfDisabled(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string | undefined,
  reply: FastifyReply
): Promise<boolean> {
  if (!tenantId) return false;
  const enabled = await isTenantModuleEnabled(supabase, tenantId, MODULE_KEY);
  if (enabled) return false;
  reply.status(403).send({ error: "module_disabled", module_key: MODULE_KEY });
  return true;
}

/** Sobreposição em intervalos [check_in, check_out) — datas exclusivas no check_out. */
async function hasBlockingReservationOverlap(
  supabase: ReturnType<typeof createNexusClient>,
  unitId: string,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string
): Promise<boolean> {
  let q = supabase
    .from("lodging_reservations")
    .select("id")
    .eq("unit_id", unitId)
    .in("status", ["pending", "confirmed"])
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);

  if (excludeReservationId) q = q.neq("id", excludeReservationId);

  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function hospedagemRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  // --- Park days ---
  fastify.get(
    "/hospedagem/park-days",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; year?: string; month?: string };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();
      const yearStr = req.query.year?.trim();
      const monthStr = req.query.month?.trim();

      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const year = parseInt(yearStr ?? "", 10);
      const month = parseInt(monthStr ?? "", 10);
      if (!Number.isFinite(year) || month < 1 || month > 12) {
        return reply.status(400).send({ error: "year and valid month required" });
      }

      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("lodging_park_days")
        .select("*")
        .eq("tenant_id", tenant_id)
        .gte("calendar_date", from)
        .lte("calendar_date", to)
        .order("calendar_date", { ascending: true });

      if (error) throw error;
      return reply.send({ data: data ?? [] });
    }
  );

  fastify.post(
    "/hospedagem/park-days/bulk",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          days?: Array<{
            calendar_date: string;
            day_kind?: string;
            lodging_rules?: string | null;
            event_label?: string | null;
            park_ticket_value?: string | null;
          }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.body.tenant_id?.trim();
      const days = req.body.days;
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;
      if (!Array.isArray(days) || days.length === 0) {
        return reply.status(400).send({ error: "days array required" });
      }
      if (days.length > 400) return reply.status(400).send({ error: "too_many_days" });

      const rows: Record<string, unknown>[] = [];
      for (const d of days) {
        const date = typeof d.calendar_date === "string" ? d.calendar_date.trim() : "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return reply.status(400).send({ error: "invalid_calendar_date", detail: d.calendar_date });
        }
        const dk = parseDayKind(d.day_kind ?? "aberto");
        if (!dk) return reply.status(400).send({ error: "invalid_day_kind", detail: d.day_kind });

        if (typeof d.event_label === "string" && d.event_label.trim() !== "") {
          const evCheck = parseEventLabel(d.event_label);
          if (!evCheck) return reply.status(400).send({ error: "invalid_event_label", detail: d.event_label });
        }

        rows.push({
          tenant_id,
          calendar_date: date,
          day_kind: dk,
          lodging_rules: null,
          event_label: parseEventLabel(d.event_label),
          park_ticket_value: parseParkTicketValue(d.park_ticket_value),
          updated_at: new Date().toISOString(),
        });
      }

      const { data, error } = await supabase
        .from("lodging_park_days")
        .upsert(rows, { onConflict: "tenant_id,calendar_date" })
        .select();

      if (error) throw error;
      return reply.send({ data: data ?? [], upserted: data?.length ?? 0 });
    }
  );

  fastify.delete(
    "/hospedagem/park-days/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: row, error: e1 } = await supabase.from("lodging_park_days").select("tenant_id").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!row) return reply.status(404).send({ error: "not_found" });
      const tenant_id = row.tenant_id as string;

      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { error: e2 } = await supabase.from("lodging_park_days").delete().eq("id", id);
      if (e2) throw e2;
      return reply.send({ ok: true });
    }
  );

  // --- Accommodation types ---
  fastify.get(
    "/hospedagem/accommodation-types",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data, error } = await supabase
        .from("lodging_accommodation_types")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return reply.send({ data: data ?? [] });
    }
  );

  fastify.post(
    "/hospedagem/accommodation-types",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          name?: string;
          description?: string | null;
          max_occupancy?: number | null;
          display_order?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.body.tenant_id?.trim();
      const name = req.body.name?.trim();
      if (!tenant_id || !name) return reply.status(400).send({ error: "tenant_id and name required" });
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data, error } = await supabase
        .from("lodging_accommodation_types")
        .insert({
          tenant_id,
          name,
          description: req.body.description ?? null,
          max_occupancy: req.body.max_occupancy ?? null,
          display_order: req.body.display_order ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.patch(
    "/hospedagem/accommodation-types/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; description?: string | null; max_occupancy?: number | null; display_order?: number };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase
        .from("lodging_accommodation_types")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      const tenant_id = existing.tenant_id as string;
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.max_occupancy !== undefined) updates.max_occupancy = req.body.max_occupancy;
      if (req.body.display_order !== undefined) updates.display_order = req.body.display_order;

      const { data, error } = await supabase.from("lodging_accommodation_types").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.delete(
    "/hospedagem/accommodation-types/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase
        .from("lodging_accommodation_types")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      const tenant_id = existing.tenant_id as string;
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { error } = await supabase.from("lodging_accommodation_types").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ ok: true });
    }
  );

  // --- Units ---
  fastify.get(
    "/hospedagem/units",
    async (
      req: FastifyRequest<{ Querystring: { tenant_id?: string; accommodation_type_id?: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();
      const type_id = req.query.accommodation_type_id?.trim();

      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      let q = supabase.from("lodging_units").select("*, lodging_accommodation_types ( id, name )").eq("tenant_id", tenant_id);
      if (type_id) q = q.eq("accommodation_type_id", type_id);
      const { data, error } = await q.order("name", { ascending: true });
      if (error) throw error;
      return reply.send({ data: data ?? [] });
    }
  );

  fastify.post(
    "/hospedagem/units",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          accommodation_type_id?: string;
          name?: string;
          status?: string;
          notes?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.body.tenant_id?.trim();
      const accommodation_type_id = req.body.accommodation_type_id?.trim();
      const name = req.body.name?.trim();
      const status = req.body.status?.trim() ?? "active";

      if (!tenant_id || !accommodation_type_id || !name) {
        return reply.status(400).send({ error: "tenant_id, accommodation_type_id, name required" });
      }
      if (!(UNIT_STATUSES as readonly string[]).includes(status)) {
        return reply.status(400).send({ error: "invalid_unit_status" });
      }
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data: tRow, error: te } = await supabase
        .from("lodging_accommodation_types")
        .select("tenant_id")
        .eq("id", accommodation_type_id)
        .maybeSingle();
      if (te) throw te;
      if (!tRow || tRow.tenant_id !== tenant_id) {
        return reply.status(400).send({ error: "accommodation_type_mismatch" });
      }

      const { data, error } = await supabase
        .from("lodging_units")
        .insert({
          tenant_id,
          accommodation_type_id,
          name,
          status,
          notes: req.body.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.patch(
    "/hospedagem/units/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { name?: string; status?: string; notes?: string | null; accommodation_type_id?: string };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase.from("lodging_units").select("tenant_id").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      const tenant_id = existing.tenant_id as string;
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (req.body.name !== undefined) updates.name = req.body.name.trim();
      if (req.body.status !== undefined) {
        if (!(UNIT_STATUSES as readonly string[]).includes(req.body.status.trim())) {
          return reply.status(400).send({ error: "invalid_unit_status" });
        }
        updates.status = req.body.status.trim();
      }
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      if (req.body.accommodation_type_id !== undefined) {
        const tid = req.body.accommodation_type_id.trim();
        const { data: tRow, error: te } = await supabase
          .from("lodging_accommodation_types")
          .select("tenant_id")
          .eq("id", tid)
          .maybeSingle();
        if (te) throw te;
        if (!tRow || tRow.tenant_id !== tenant_id) return reply.status(400).send({ error: "accommodation_type_mismatch" });
        updates.accommodation_type_id = tid;
      }

      const { data, error } = await supabase.from("lodging_units").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.delete(
    "/hospedagem/units/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase.from("lodging_units").select("tenant_id").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      const tenant_id = existing.tenant_id as string;
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { error } = await supabase.from("lodging_units").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ ok: true });
    }
  );

  // --- Reservations ---
  fastify.get(
    "/hospedagem/reservations",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();

      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const q = supabase
        .from("lodging_reservations")
        .select("*, lodging_units ( id, name, accommodation_type_id ), contacts ( id, name, phone )")
        .eq("tenant_id", tenant_id)
        .order("check_in", { ascending: true })
        .limit(500);

      const { data, error } = await q;
      if (error) throw error;
      return reply.send({ data: data ?? [] });
    }
  );

  fastify.get(
    "/hospedagem/availability",
    async (
      req: FastifyRequest<{ Querystring: { tenant_id?: string; check_in?: string; check_out?: string } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();
      const check_in = req.query.check_in?.trim();
      const check_out = req.query.check_out?.trim();

      if (!tenant_id || !check_in || !check_out) {
        return reply.status(400).send({ error: "tenant_id, check_in, check_out required" });
      }
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;
      if (check_out <= check_in) return reply.status(400).send({ error: "check_out_must_be_after_check_in" });

      const { data: units, error: ue } = await supabase
        .from("lodging_units")
        .select("id, name, accommodation_type_id, status")
        .eq("tenant_id", tenant_id)
        .eq("status", "active");

      if (ue) throw ue;
      const list = units ?? [];

      const out = await Promise.all(
        list.map(async (u: { id: string; name: string; accommodation_type_id: string; status: string }) => {
          const blocked = await hasBlockingReservationOverlap(supabase, u.id, check_in, check_out);
          return {
            unit_id: u.id,
            name: u.name,
            accommodation_type_id: u.accommodation_type_id,
            available: !blocked,
          };
        })
      );

      return reply.send({ check_in, check_out, units: out });
    }
  );

  fastify.post(
    "/hospedagem/reservations",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          unit_id?: string;
          contact_id?: string | null;
          check_in?: string;
          check_out?: string;
          status?: string;
          notes?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.body.tenant_id?.trim();
      const unit_id = req.body.unit_id?.trim();
      const check_in = req.body.check_in?.trim();
      const check_out = req.body.check_out?.trim();
      let status = parseResStatus(req.body.status ?? "pending") ?? "pending";

      if (!tenant_id || !unit_id || !check_in || !check_out) {
        return reply.status(400).send({ error: "tenant_id, unit_id, check_in, check_out required" });
      }
      if (check_out <= check_in) return reply.status(400).send({ error: "check_out_must_be_after_check_in" });
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data: uRow, error: ue } = await supabase.from("lodging_units").select("tenant_id").eq("id", unit_id).maybeSingle();
      if (ue) throw ue;
      if (!uRow || uRow.tenant_id !== tenant_id) return reply.status(400).send({ error: "unit_mismatch" });

      let contact_id: string | null = req.body.contact_id ?? null;
      if (contact_id) {
        const { data: cRow, error: ce } = await supabase.from("contacts").select("tenant_id").eq("id", contact_id).maybeSingle();
        if (ce) throw ce;
        if (!cRow || cRow.tenant_id !== tenant_id) return reply.status(400).send({ error: "contact_mismatch" });
      }

      if (status !== "cancelled") {
        const overlap = await hasBlockingReservationOverlap(supabase, unit_id, check_in, check_out);
        if (overlap) {
          return reply.status(409).send({
            error: "unit_already_reserved",
            detail: "Já existe reserva pendente ou confirmada que cruza esse período para esta unidade.",
          });
        }
      }

      const { data, error } = await supabase
        .from("lodging_reservations")
        .insert({
          tenant_id,
          unit_id,
          contact_id,
          check_in,
          check_out,
          status,
          notes: req.body.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.patch(
    "/hospedagem/reservations/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: {
          check_in?: string;
          check_out?: string;
          status?: string;
          notes?: string | null;
          contact_id?: string | null;
          unit_id?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase
        .from("lodging_reservations")
        .select("tenant_id, unit_id, check_in, check_out, status")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      const tenant_id = existing.tenant_id as string;

      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (req.body.notes !== undefined) updates.notes = req.body.notes;

      let nextContact = undefined as string | null | undefined;
      if (req.body.contact_id !== undefined) {
        nextContact = req.body.contact_id;
        if (nextContact) {
          const { data: cRow, error: ce } = await supabase.from("contacts").select("tenant_id").eq("id", nextContact).maybeSingle();
          if (ce) throw ce;
          if (!cRow || cRow.tenant_id !== tenant_id) return reply.status(400).send({ error: "contact_mismatch" });
        }
        updates.contact_id = nextContact;
      }

      let check_in = (existing.check_in as string).slice(0, 10);
      let check_out = (existing.check_out as string).slice(0, 10);

      if (req.body.check_in !== undefined) check_in = req.body.check_in.trim();
      if (req.body.check_out !== undefined) check_out = req.body.check_out.trim();

      let nextStatus = parseResStatus(existing.status as string) ?? "pending";
      if (req.body.status !== undefined) {
        const s = parseResStatus(req.body.status);
        if (!s) return reply.status(400).send({ error: "invalid_status" });
        nextStatus = s;
        updates.status = s;
      }

      if (req.body.unit_id !== undefined) {
        const newUnit = req.body.unit_id.trim();
        const { data: uRow, error: ue } = await supabase.from("lodging_units").select("tenant_id").eq("id", newUnit).maybeSingle();
        if (ue) throw ue;
        if (!uRow || uRow.tenant_id !== tenant_id) return reply.status(400).send({ error: "unit_mismatch" });
        updates.unit_id = newUnit;
      }

      updates.check_in = check_in;
      updates.check_out = check_out;

      if (check_out <= check_in) return reply.status(400).send({ error: "check_out_must_be_after_check_in" });

      if (nextStatus !== "cancelled") {
        const effectiveUnitId = (updates.unit_id as string | undefined) ?? (existing.unit_id as string);
        const overlap = await hasBlockingReservationOverlap(
          supabase,
          effectiveUnitId,
          check_in,
          check_out,
          id
        );
        if (overlap) {
          return reply.status(409).send({
            error: "unit_already_reserved",
            detail: "Já existe reserva pendente ou confirmada que cruza esse período para esta unidade.",
          });
        }
      }

      const { data, error } = await supabase.from("lodging_reservations").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.delete(
    "/hospedagem/reservations/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const { id } = req.params;

      const { data: existing, error: e1 } = await supabase.from("lodging_reservations").select("tenant_id").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!existing) return reply.status(404).send({ error: "not_found" });
      if (!canManageTenant(auth, existing.tenant_id as string)) {
        return reply.status(403).send({ error: "forbidden_tenant_access" });
      }
      if (await denyIfDisabled(supabase, existing.tenant_id as string, reply)) return;

      const { error } = await supabase.from("lodging_reservations").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ ok: true });
    }
  );

  // --- Rates (Valores) ---
  fastify.get(
    "/hospedagem/rates",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; accommodation_type_id?: string };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;
      const tenant_id = req.query.tenant_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      let q = supabase
        .from("lodging_rate_items")
        .select("*, lodging_accommodation_types (id, name)")
        .eq("tenant_id", tenant_id)
        .order("accommodation_type_id", { ascending: true })
        .order("guests", { ascending: true })
        .order("nights", { ascending: true });

      if (req.query.accommodation_type_id) {
        q = q.eq("accommodation_type_id", req.query.accommodation_type_id.trim());
      }

      const { data, error } = await q;
      if (error) throw error;
      return reply.send({ data });
    }
  );

  fastify.post(
    "/hospedagem/rates",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id: string;
          accommodation_type_id: string;
          guests: number;
          nights: number;
          price: number;
          currency?: string;
          valid_from?: string | null;
          valid_to?: string | null;
          notes?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const { tenant_id, accommodation_type_id, guests, nights, price, currency, valid_from, valid_to, notes } = req.body;
      if (!tenant_id || !accommodation_type_id || guests <= 0 || nights <= 0 || price == null)
        return reply.status(400).send({ error: "missing_required_fields" });
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data, error } = await supabase
        .from("lodging_rate_items")
        .insert([{ tenant_id, accommodation_type_id, guests, nights, price, currency: currency || "BRL", valid_from: valid_from || null, valid_to: valid_to || null, notes: notes || null }])
        .select()
        .single();
      if (error) throw error;
      return reply.status(201).send(data);
    }
  );

  fastify.patch(
    "/hospedagem/rates/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { tenant_id: string; patch: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const { id } = req.params;
      const { tenant_id, patch } = req.body;
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { data: existing, error: e1 } = await supabase.from("lodging_rate_items").select("tenant_id").eq("id", id).maybeSingle();
      if (e1 || !existing) throw e1 || new Error("Rate not found");
      if (existing.tenant_id !== tenant_id) return reply.status(403).send({ error: "forbidden" });

      const { data, error } = await supabase.from("lodging_rate_items").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return reply.send(data);
    }
  );

  fastify.delete(
    "/hospedagem/rates/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { tenant_id?: string };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const tenant_id = req.query.tenant_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!canManageTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      const { id } = req.params;
      const { data: existing, error: e1 } = await supabase.from("lodging_rate_items").select("tenant_id").eq("id", id).maybeSingle();
      if (e1 || !existing) throw e1 || new Error("Rate not found");
      if (existing.tenant_id !== tenant_id) return reply.status(403).send({ error: "forbidden" });

      const { error } = await supabase.from("lodging_rate_items").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ ok: true });
    }
  );

  // --- Hospedagem Query Tool (para agentes) ---
  fastify.post(
    "/hospedagem/consultar-sunset",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          check_in?: string;
          check_out?: string;
          guests?: Array<{ type: string; age?: number }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const tenant_id = req.body.tenant_id?.trim();
      const check_in = req.body.check_in?.trim();
      const check_out = req.body.check_out?.trim();
      const guests = req.body.guests ?? [];

      if (!tenant_id || !check_in || !check_out) {
        return reply.status(400).send({ error: "tenant_id, check_in, check_out required" });
      }
      if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
      if (await denyIfDisabled(supabase, tenant_id, reply)) return;

      if (check_out <= check_in) return reply.status(400).send({ error: "check_out_must_be_after_check_in" });

      // Validar formato de datas
      if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(check_out)) {
        return reply.status(400).send({ error: "invalid_date_format", detail: "YYYY-MM-DD required" });
      }

      const out = await runLodgingConsulta(supabase, { tenant_id, check_in, check_out, guests });
      if (!out.ok) {
        return reply.status(out.status).send(out.body);
      }
      return reply.send(out.data);
    }
  );
}
