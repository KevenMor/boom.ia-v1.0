import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { isTenantModuleEnabled } from "../services/tenant-modules.js";
import { assertLotTransition, parseLotStatus, type LotStatus } from "../services/lot-status.js";
import { authorizeLoteamentos } from "./loteamentos-embed-auth.js";

const MODULE_KEY = "loteamentos";

const DEV_STATUSES = ["active", "inactive"] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "empreendimento";
}

async function denyIfDisabled(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string | undefined,
  reply: FastifyReply,
): Promise<boolean> {
  if (!tenantId) return false;
  const enabled = await isTenantModuleEnabled(supabase, tenantId, MODULE_KEY);
  if (enabled) return false;
  reply.status(403).send({ error: "module_disabled", module_key: MODULE_KEY });
  return true;
}

async function ensureContactInTenant(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  contactId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function loteamentosRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  fastify.get(
    "/loteamentos/summary",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const tenant_id = req.query.tenant_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "read", denyIfDisabled))) return;

      const { data: developments, error: e1 } = await supabase
        .from("lot_developments")
        .select("id, name, slug, status")
        .eq("tenant_id", tenant_id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (e1) throw e1;

      const { data: lots, error: e2 } = await supabase
        .from("lots")
        .select("development_id, status")
        .eq("tenant_id", tenant_id);
      if (e2) throw e2;

      const countsByDev = new Map<string, Record<string, number>>();
      for (const lot of lots ?? []) {
        const devId = lot.development_id as string;
        const st = lot.status as string;
        const cur = countsByDev.get(devId) ?? {};
        cur[st] = (cur[st] ?? 0) + 1;
        countsByDev.set(devId, cur);
      }

      const summary = (developments ?? []).map((d) => {
        const c = countsByDev.get(d.id as string) ?? {};
        return {
          ...d,
          counts: {
            available: c.available ?? 0,
            reserved: c.reserved ?? 0,
            sold: c.sold ?? 0,
            blocked: c.blocked ?? 0,
            total: (c.available ?? 0) + (c.reserved ?? 0) + (c.sold ?? 0) + (c.blocked ?? 0),
          },
        };
      });

      return reply.send({ data: summary });
    },
  );

  fastify.get(
    "/loteamentos/developments",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      const tenant_id = req.query.tenant_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "read", denyIfDisabled))) return;

      const { data, error } = await supabase
        .from("lot_developments")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return reply.send({ data: data ?? [] });
    },
  );

  fastify.post(
    "/loteamentos/developments",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          name?: string;
          slug?: string;
          city?: string | null;
          state?: string | null;
          address?: string | null;
          description?: string | null;
          status?: string;
          map_image_url?: string | null;
          map_config?: Record<string, unknown> | null;
          display_order?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = req.body ?? {};
      const tenant_id = body.tenant_id?.trim();
      const name = body.name?.trim();
      if (!tenant_id || !name) return reply.status(400).send({ error: "tenant_id and name required" });
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

      const status = body.status === "inactive" ? "inactive" : "active";
      const slug = (body.slug?.trim() || slugify(name)).slice(0, 80);

      const { data, error } = await supabase
        .from("lot_developments")
        .insert({
          tenant_id,
          name,
          slug,
          city: body.city ?? null,
          state: body.state ?? null,
          address: body.address ?? null,
          description: body.description ?? null,
          status,
          map_image_url: body.map_image_url ?? null,
          map_config: body.map_config ?? {},
          display_order: body.display_order ?? 0,
        })
        .select()
        .single();
      if (error) return reply.status(400).send({ error: error.message });
      return reply.send({ data });
    },
  );

  fastify.patch(
    "/loteamentos/developments/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      const { data: row, error: e0 } = await supabase
        .from("lot_developments")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (e0) throw e0;
      if (!row) return reply.status(404).send({ error: "not_found" });
      const tenant_id = row.tenant_id as string;
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

      const body = req.body ?? {};
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
      if (typeof body.slug === "string" && body.slug.trim()) update.slug = body.slug.trim();
      if (body.city !== undefined) update.city = body.city;
      if (body.state !== undefined) update.state = body.state;
      if (body.address !== undefined) update.address = body.address;
      if (body.description !== undefined) update.description = body.description;
      if (body.map_image_url !== undefined) update.map_image_url = body.map_image_url;
      if (body.map_config !== undefined) update.map_config = body.map_config;
      if (typeof body.display_order === "number") update.display_order = body.display_order;
      if (typeof body.status === "string" && (DEV_STATUSES as readonly string[]).includes(body.status)) {
        update.status = body.status;
      }

      const { data, error } = await supabase.from("lot_developments").update(update).eq("id", id).select().single();
      if (error) return reply.status(400).send({ error: error.message });
      return reply.send({ data });
    },
  );

  fastify.delete(
    "/loteamentos/developments/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = req.params;
      const { data: row, error: e0 } = await supabase
        .from("lot_developments")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();
      if (e0) throw e0;
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (!(await authorizeLoteamentos(req, reply, supabase, row.tenant_id as string, "manage", denyIfDisabled))) return;

      const { error } = await supabase.from("lot_developments").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ success: true });
    },
  );

  fastify.get(
    "/loteamentos/lots",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; development_id?: string; status?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenant_id = req.query.tenant_id?.trim();
      const development_id = req.query.development_id?.trim();
      if (!tenant_id) return reply.status(400).send({ error: "tenant_id is required" });
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "read", denyIfDisabled))) return;

      let q = supabase
        .from("lots")
        .select("*, contacts(id, name, email, phone)")
        .eq("tenant_id", tenant_id)
        .order("code", { ascending: true });
      if (development_id) q = q.eq("development_id", development_id);
      const status = req.query.status?.trim();
      if (status && parseLotStatus(status)) q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;
      return reply.send({ data: data ?? [] });
    },
  );

  fastify.post(
    "/loteamentos/lots",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          development_id?: string;
          code?: string;
          block?: string | null;
          lot_number?: string | null;
          area_m2?: number | null;
          status?: string;
          list_price?: number | null;
          map_geometry?: Record<string, unknown> | null;
          notes?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const body = req.body ?? {};
      const tenant_id = body.tenant_id?.trim();
      const development_id = body.development_id?.trim();
      const code = body.code?.trim();
      if (!tenant_id || !development_id || !code) {
        return reply.status(400).send({ error: "tenant_id, development_id and code required" });
      }
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

      const status = parseLotStatus(body.status ?? "available") ?? "available";

      const { data, error } = await supabase
        .from("lots")
        .insert({
          tenant_id,
          development_id,
          code,
          block: body.block ?? null,
          lot_number: body.lot_number ?? null,
          area_m2: body.area_m2 ?? null,
          status,
          list_price: body.list_price ?? null,
          map_geometry: body.map_geometry ?? null,
          notes: body.notes ?? null,
        })
        .select()
        .single();
      if (error) return reply.status(400).send({ error: error.message });
      return reply.send({ data });
    },
  );

  fastify.patch(
    "/loteamentos/lots/:id",
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      const { data: row, error: e0 } = await supabase.from("lots").select("*").eq("id", id).maybeSingle();
      if (e0) throw e0;
      if (!row) return reply.status(404).send({ error: "not_found" });
      const tenant_id = row.tenant_id as string;
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

      const body = req.body ?? {};
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.code === "string" && body.code.trim()) update.code = body.code.trim();
      if (body.block !== undefined) update.block = body.block;
      if (body.lot_number !== undefined) update.lot_number = body.lot_number;
      if (body.area_m2 !== undefined) update.area_m2 = body.area_m2;
      if (body.list_price !== undefined) update.list_price = body.list_price;
      if (body.map_geometry !== undefined) update.map_geometry = body.map_geometry;
      if (body.notes !== undefined) update.notes = body.notes;

      if (body.status !== undefined) {
        const next = parseLotStatus(body.status);
        if (!next) return reply.status(400).send({ error: "invalid_status" });
        try {
          assertLotTransition(row.status as LotStatus, next);
        } catch {
          return reply.status(400).send({ error: "invalid_lot_status_transition" });
        }
        update.status = next;
      }

      const { data, error } = await supabase.from("lots").update(update).eq("id", id).select().single();
      if (error) return reply.status(400).send({ error: error.message });
      return reply.send({ data });
    },
  );

  fastify.delete(
    "/loteamentos/lots/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = req.params;
      const { data: row, error: e0 } = await supabase.from("lots").select("tenant_id").eq("id", id).maybeSingle();
      if (e0) throw e0;
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (!(await authorizeLoteamentos(req, reply, supabase, row.tenant_id as string, "manage", denyIfDisabled))) return;

      const { error } = await supabase.from("lots").delete().eq("id", id);
      if (error) throw error;
      return reply.send({ success: true });
    },
  );

  async function loadLot(id: string) {
    const { data, error } = await supabase.from("lots").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function applyStatusChange(
    req: FastifyRequest,
    reply: FastifyReply,
    id: string,
    nextStatus: LotStatus,
    extra: Record<string, unknown>,
  ) {
    const row = await loadLot(id);
    if (!row) return reply.status(404).send({ error: "not_found" });
    const tenant_id = row.tenant_id as string;
    if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

    try {
      assertLotTransition(row.status as LotStatus, nextStatus);
    } catch {
      return reply.status(400).send({ error: "invalid_lot_status_transition" });
    }

    const { data, error } = await supabase
      .from("lots")
      .update({ status: nextStatus, ...extra, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, contacts(id, name, email, phone)")
      .single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.send({ data });
  }

  fastify.post(
    "/loteamentos/lots/:id/reserve",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { contact_id?: string; reserved_until?: string | null; notes?: string | null };
      }>,
      reply: FastifyReply,
    ) => {
      const contact_id = req.body?.contact_id?.trim();
      if (!contact_id) return reply.status(400).send({ error: "contact_id required" });
      const row = await loadLot(req.params.id);
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (!(await ensureContactInTenant(supabase, row.tenant_id as string, contact_id))) {
        return reply.status(400).send({ error: "contact_not_in_tenant" });
      }
      return applyStatusChange(req, reply, req.params.id, "reserved", {
        contact_id,
        reserved_at: new Date().toISOString(),
        reserved_until: req.body?.reserved_until ?? null,
        sold_at: null,
        notes: req.body?.notes ?? row.notes,
      });
    },
  );

  fastify.post(
    "/loteamentos/lots/:id/sell",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { contact_id?: string; notes?: string | null };
      }>,
      reply: FastifyReply,
    ) => {
      const contact_id = req.body?.contact_id?.trim();
      if (!contact_id) return reply.status(400).send({ error: "contact_id required" });
      const row = await loadLot(req.params.id);
      if (!row) return reply.status(404).send({ error: "not_found" });
      if (!(await ensureContactInTenant(supabase, row.tenant_id as string, contact_id))) {
        return reply.status(400).send({ error: "contact_not_in_tenant" });
      }
      return applyStatusChange(req, reply, req.params.id, "sold", {
        contact_id,
        sold_at: new Date().toISOString(),
        reserved_at: null,
        reserved_until: null,
        notes: req.body?.notes ?? row.notes,
      });
    },
  );

  fastify.post(
    "/loteamentos/lots/:id/release",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const row = await loadLot(req.params.id);
      if (!row) return reply.status(404).send({ error: "not_found" });
      return applyStatusChange(req, reply, req.params.id, "available", {
        contact_id: null,
        reserved_at: null,
        reserved_until: null,
        sold_at: null,
      });
    },
  );

  fastify.post(
    "/loteamentos/lots/:id/block",
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: { notes?: string | null } }>,
      reply: FastifyReply,
    ) => {
      const row = await loadLot(req.params.id);
      if (!row) return reply.status(404).send({ error: "not_found" });
      return applyStatusChange(req, reply, req.params.id, "blocked", {
        contact_id: null,
        reserved_at: null,
        reserved_until: null,
        sold_at: null,
        notes: req.body?.notes ?? row.notes,
      });
    },
  );

  fastify.post(
    "/loteamentos/lots/bulk",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          development_id?: string;
          lots?: Array<{
            code: string;
            block?: string | null;
            lot_number?: string | null;
            area_m2?: number | null;
            status?: string;
            list_price?: number | null;
            map_geometry?: Record<string, unknown> | null;
            notes?: string | null;
          }>;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenant_id = req.body?.tenant_id?.trim();
      const development_id = req.body?.development_id?.trim();
      const lots = req.body?.lots;
      if (!tenant_id || !development_id || !Array.isArray(lots) || lots.length === 0) {
        return reply.status(400).send({ error: "tenant_id, development_id and lots required" });
      }
      if (lots.length > 500) return reply.status(400).send({ error: "too_many_lots" });
      if (!(await authorizeLoteamentos(req, reply, supabase, tenant_id, "manage", denyIfDisabled))) return;

      const rows = lots.map((l) => ({
        tenant_id,
        development_id,
        code: l.code.trim(),
        block: l.block ?? null,
        lot_number: l.lot_number ?? null,
        area_m2: l.area_m2 ?? null,
        status: parseLotStatus(l.status ?? "available") ?? "available",
        list_price: l.list_price ?? null,
        map_geometry: l.map_geometry ?? null,
        notes: l.notes ?? null,
      }));

      const { data, error } = await supabase
        .from("lots")
        .upsert(rows, { onConflict: "development_id,code" })
        .select();
      if (error) return reply.status(400).send({ error: error.message });
      return reply.send({ data: data ?? [], upserted: data?.length ?? 0 });
    },
  );
}
