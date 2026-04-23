import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { isTenantModuleEnabled } from "../services/tenant-modules.js";
import {
  canAccessTenant,
  canManageTenant,
  requireAuthenticated,
  type AccessContext,
} from "../services/authorization.js";
import { writeAuditLog } from "../services/audit.js";

const MODULE_KEY = "occurrences";

const STATUS_VALUES = ["aberta", "em_andamento", "resolvida", "cancelada"] as const;
const SEVERITY_VALUES = ["baixa", "media", "alta", "critica"] as const;
const LOCATION_TYPE_VALUES = [
  "loja",
  "patio",
  "test_drive",
  "transporte",
  "oficina",
  "externo",
  "outro",
] as const;

type OccurrenceStatus = (typeof STATUS_VALUES)[number];
type OccurrenceSeverity = (typeof SEVERITY_VALUES)[number];
type OccurrenceLocationType = (typeof LOCATION_TYPE_VALUES)[number];

async function denyIfOccurrencesDisabled(
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

/**
 * Verifica se o utilizador tem uma action permitida via user_module_acl.
 * Retorna true se permitido, false se negado.
 * superadmin e tenant_admin têm acesso irrestrito.
 */
async function canActionViaUserAcl(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  auth: AccessContext,
  action: string
): Promise<boolean> {
  if (auth.role === "superadmin") return true;
  if (auth.tenantAdminIds.includes(tenantId)) return true;

  const { data: row } = await supabase
    .from("user_module_acl")
    .select("enabled, allowed_actions")
    .eq("tenant_id", tenantId)
    .eq("user_id", auth.userId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();

  if (!row) return false; // sem ACL = sem permissão para tenant_user
  if (!(row as { enabled?: boolean }).enabled) return false;
  const actions = (row as { allowed_actions?: string[] | null }).allowed_actions;
  if (!actions || actions.length === 0) return true; // null = todas as actions permitidas
  return actions.includes(action);
}

/** Se existir pelo menos uma linha de ACL para o tenant, restringe a esses utilizadores. */
async function denyIfOccurrenceAclDenied(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  auth: AccessContext,
  needManage: boolean,
  reply: FastifyReply
): Promise<boolean> {
  if (auth.role === "superadmin") return false;

  const { count, error: countErr } = await supabase
    .from("occurrence_module_acl")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (countErr) {
    console.error("occurrence_module_acl count error:", countErr);
    reply.status(500).send({ error: countErr.message });
    return true;
  }

  const aclCount = count ?? 0;
  if (aclCount === 0) return false;

  const { data: row, error } = await supabase
    .from("occurrence_module_acl")
    .select("can_view, can_manage")
    .eq("tenant_id", tenantId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) {
    console.error("occurrence_module_acl lookup error:", error);
    reply.status(500).send({ error: error.message });
    return true;
  }

  if (!row) {
    reply.status(403).send({ error: "occurrences_acl_denied" });
    return true;
  }

  if (needManage && !row.can_manage) {
    reply.status(403).send({ error: "occurrences_acl_denied", detail: "manage_required" });
    return true;
  }

  if (!needManage && row.can_view !== true) {
    reply.status(403).send({ error: "occurrences_acl_denied", detail: "view_required" });
    return true;
  }

  return false;
}

function parseStatus(raw: unknown): OccurrenceStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (STATUS_VALUES as readonly string[]).includes(s) ? (s as OccurrenceStatus) : null;
}

function parseSeverity(raw: unknown): OccurrenceSeverity | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (SEVERITY_VALUES as readonly string[]).includes(s) ? (s as OccurrenceSeverity) : null;
}

function parseLocationType(raw: unknown): OccurrenceLocationType | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (LOCATION_TYPE_VALUES as readonly string[]).includes(s) ? (s as OccurrenceLocationType) : null;
}

/** null = explicit clear; undefined = omit from update */
function parseOdometerKm(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** POST: ausente / null / "" → null; string → uuid ou inválido */
function parseContactIdForCreate(raw: unknown): string | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  return isUuid(s) ? s : "invalid";
}

/** PATCH: ausente → omitir; null / "" → limpar; uuid → validar */
type ContactIdPatch = "omit" | "clear" | { id: string } | "invalid";

function parseContactIdForPatch(raw: unknown): ContactIdPatch {
  if (raw === undefined) return "omit";
  if (raw === null || raw === "") return "clear";
  const s = String(raw).trim();
  if (!s) return "clear";
  return isUuid(s) ? { id: s } : "invalid";
}

async function assertContactBelongsToTenant(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  contactId: string
): Promise<boolean> {
  const { data, error } = await supabase.from("contacts").select("tenant_id").eq("id", contactId).maybeSingle();
  if (error) throw error;
  return Boolean(data && data.tenant_id === tenantId);
}

const MAX_OCCURRENCE_PHOTOS = 15;
const MAX_PHOTO_URL_LEN = 2048;

/** undefined = omit; null ou [] = limpar; array validado */
function parsePhotoUrls(raw: unknown): string[] | "invalid" | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  if (!Array.isArray(raw)) return "invalid";
  const out: string[] = [];
  for (const x of raw) {
    const s = typeof x === "string" ? x.trim() : "";
    if (!s) continue;
    if (s.length > MAX_PHOTO_URL_LEN) return "invalid";
    out.push(s);
    if (out.length > MAX_OCCURRENCE_PHOTOS) return "invalid";
  }
  return out;
}

export async function occurrencesRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  fastify.get(
    "/occurrences",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant_id?: string;
          inventory_id?: string;
          status?: string;
          severity?: string;
          limit?: string;
          offset?: string;
          search?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const { tenant_id, inventory_id, status, severity, limit = "100", offset = "0", search } = req.query;

        if (auth.role !== "superadmin" && !tenant_id) {
          return reply.status(400).send({ error: "tenant_id is required" });
        }

        if (tenant_id && !canAccessTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfOccurrencesDisabled(supabase, tenant_id, reply)) return;
        if (tenant_id && (await denyIfOccurrenceAclDenied(supabase, tenant_id, auth, false, reply))) return;

        let query = supabase
          .from("occurrences")
          .select(
            "id, tenant_id, inventory_id, contact_id, title, description, status, severity, occurred_at, location_type, location_detail, odometer_km, photo_urls, created_by, created_at, updated_at, inventory (id, brand, model, version, year, price, photo_url, external_id, detail_url, status), contacts (id, name, phone, email)",
            { count: "exact" }
          )
          .order("occurred_at", { ascending: false });

        if (tenant_id) query = query.eq("tenant_id", tenant_id);
        if (inventory_id) query = query.eq("inventory_id", inventory_id);
        if (status && STATUS_VALUES.includes(status as OccurrenceStatus)) {
          query = query.eq("status", status);
        }
        if (severity && SEVERITY_VALUES.includes(severity as OccurrenceSeverity)) {
          query = query.eq("severity", severity);
        }
        if (search && search.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(`title.ilike.${term},description.ilike.${term},location_detail.ilike.${term}`);
        }

        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        return reply.send({ data: data ?? [], total: count ?? 0 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("occurrences list error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  fastify.get(
    "/occurrences/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;

        const { data, error } = await supabase
          .from("occurrences")
          .select(
            "id, tenant_id, inventory_id, contact_id, title, description, status, severity, occurred_at, location_type, location_detail, odometer_km, photo_urls, created_by, created_at, updated_at, inventory (id, brand, model, version, year, price, photo_url, external_id, detail_url, status), contacts (id, name, phone, email)"
          )
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) return reply.status(404).send({ error: "Ocorrência não encontrada" });

        const tenantId = (data as { tenant_id: string }).tenant_id;
        if (!canAccessTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfOccurrencesDisabled(supabase, tenantId, reply)) return;
        if (await denyIfOccurrenceAclDenied(supabase, tenantId, auth, false, reply)) return;

        return reply.send(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("occurrences get error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  fastify.post(
    "/occurrences",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id?: string;
          inventory_id?: string;
          title?: string;
          description?: string | null;
          status?: string;
          severity?: string;
          occurred_at?: string;
          location_type?: string;
          location_detail?: string | null;
          odometer_km?: number | null;
          photo_urls?: string[] | null;
          contact_id?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const body = req.body as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
        const inventoryId = typeof body.inventory_id === "string" ? body.inventory_id : "";
        const title = typeof body.title === "string" ? body.title.trim() : "";

        if (!tenantId || !inventoryId || !title) {
          return reply.status(400).send({ error: "tenant_id, inventory_id e title são obrigatórios" });
        }
        if (!canAccessTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (!(await canActionViaUserAcl(supabase, tenantId, auth, "register"))) {
          return reply.status(403).send({ error: "unauthorized" });
        }
        if (await denyIfOccurrencesDisabled(supabase, tenantId, reply)) return;
        if (await denyIfOccurrenceAclDenied(supabase, tenantId, auth, true, reply)) return;

        const { data: inv, error: invErr } = await supabase
          .from("inventory")
          .select("id, tenant_id")
          .eq("id", inventoryId)
          .maybeSingle();

        if (invErr) throw invErr;
        if (!inv || inv.tenant_id !== tenantId) {
          return reply.status(400).send({ error: "Veículo inválido ou não pertence ao tenant" });
        }

        const status = parseStatus(body.status) ?? "aberta";
        const severity = parseSeverity(body.severity) ?? "media";
        const occurredAt =
          typeof body.occurred_at === "string" && body.occurred_at.trim()
            ? body.occurred_at.trim()
            : new Date().toISOString();

        const locationType = parseLocationType(body.location_type) ?? "loja";
        const locationDetailRaw =
          body.location_detail === null || body.location_detail === undefined
            ? null
            : String(body.location_detail).trim() || null;
        if (locationType === "outro" && !locationDetailRaw) {
          return reply.status(400).send({ error: "location_detail é obrigatório quando o local é «Outro»" });
        }

        const odometerParsed = parseOdometerKm(body.odometer_km);
        const odometer_km = odometerParsed === undefined ? null : odometerParsed;

        const contactParsed = parseContactIdForCreate(body.contact_id);
        if (contactParsed === "invalid") {
          return reply.status(400).send({ error: "contact_id inválido" });
        }
        let contact_id: string | null = null;
        if (contactParsed) {
          const ok = await assertContactBelongsToTenant(supabase, tenantId, contactParsed);
          if (!ok) return reply.status(400).send({ error: "Cliente inválido ou não pertence ao tenant" });
          contact_id = contactParsed;
        }

        let photo_urls: string[] = [];
        if (body.photo_urls !== undefined) {
          const parsed = parsePhotoUrls(body.photo_urls);
          if (parsed === "invalid") {
            return reply.status(400).send({
              error: `photo_urls inválido (máximo ${MAX_OCCURRENCE_PHOTOS} URLs, cada uma até ${MAX_PHOTO_URL_LEN} caracteres)`,
            });
          }
          photo_urls = parsed ?? [];
        }

        const record = {
          tenant_id: tenantId,
          inventory_id: inventoryId,
          contact_id,
          title,
          description: body.description != null ? String(body.description) : null,
          status,
          severity,
          occurred_at: occurredAt,
          location_type: locationType,
          location_detail: locationDetailRaw,
          odometer_km,
          photo_urls,
          created_by: auth.userId,
        };

        const { data, error } = await supabase.from("occurrences").insert(record).select().single();
        if (error) throw error;
        void writeAuditLog({
          tenantId,
          auth,
          resource: "occurrence",
          resourceId: (data as { id?: string }).id,
          resourceLabel: title,
          action: "create",
        });
        return reply.status(201).send(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("occurrences create error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  fastify.patch(
    "/occurrences/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: {
          title?: string;
          description?: string | null;
          status?: string;
          severity?: string;
          occurred_at?: string;
          inventory_id?: string;
          location_type?: string;
          location_detail?: string | null;
          odometer_km?: number | null;
          photo_urls?: string[] | null;
          contact_id?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const body = req.body as Record<string, unknown>;

        const { data: existing, error: exErr } = await supabase
          .from("occurrences")
          .select("tenant_id, inventory_id, location_type, location_detail, title")
          .eq("id", id)
          .maybeSingle();

        if (exErr) throw exErr;
        if (!existing) return reply.status(404).send({ error: "Ocorrência não encontrada" });

        const tenantId = existing.tenant_id as string;
        if (!canAccessTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (!(await canActionViaUserAcl(supabase, tenantId, auth, "edit"))) {
          return reply.status(403).send({ error: "unauthorized" });
        }
        if (await denyIfOccurrencesDisabled(supabase, tenantId, reply)) return;
        if (await denyIfOccurrenceAclDenied(supabase, tenantId, auth, true, reply)) return;

        const updates: Record<string, unknown> = {};
        if (body.title !== undefined) {
          const t = typeof body.title === "string" ? body.title.trim() : "";
          if (!t) return reply.status(400).send({ error: "title não pode ser vazio" });
          updates.title = t;
        }
        if (body.description !== undefined) {
          updates.description = body.description === null ? null : String(body.description);
        }
        if (body.status !== undefined) {
          const st = parseStatus(body.status);
          if (!st) return reply.status(400).send({ error: "status inválido" });
          updates.status = st;
        }
        if (body.severity !== undefined) {
          const sev = parseSeverity(body.severity);
          if (!sev) return reply.status(400).send({ error: "severity inválida" });
          updates.severity = sev;
        }
        if (body.occurred_at !== undefined && typeof body.occurred_at === "string" && body.occurred_at.trim()) {
          updates.occurred_at = body.occurred_at.trim();
        }

        if (body.inventory_id !== undefined) {
          const newInvId = typeof body.inventory_id === "string" ? body.inventory_id : "";
          if (!newInvId) return reply.status(400).send({ error: "inventory_id inválido" });
          const { data: inv, error: invErr } = await supabase
            .from("inventory")
            .select("id, tenant_id")
            .eq("id", newInvId)
            .maybeSingle();
          if (invErr) throw invErr;
          if (!inv || inv.tenant_id !== tenantId) {
            return reply.status(400).send({ error: "Veículo inválido ou não pertence ao tenant" });
          }
          updates.inventory_id = newInvId;
        }

        if (body.location_type !== undefined) {
          const lt = parseLocationType(body.location_type);
          if (!lt) return reply.status(400).send({ error: "location_type inválido" });
          updates.location_type = lt;
        }
        if (body.location_detail !== undefined) {
          updates.location_detail =
            body.location_detail === null ? null : String(body.location_detail).trim() || null;
        }
        if (body.odometer_km !== undefined) {
          const od = parseOdometerKm(body.odometer_km);
          if (od === undefined && body.odometer_km !== null && body.odometer_km !== "") {
            return reply.status(400).send({ error: "odometer_km inválido" });
          }
          updates.odometer_km = od === undefined ? null : od;
        }

        const existingLocType =
          parseLocationType((existing as { location_type?: unknown }).location_type) ?? "loja";
        const nextLocType = (updates.location_type as OccurrenceLocationType | undefined) ?? existingLocType;
        const nextLocDetail =
          updates.location_detail !== undefined
            ? (updates.location_detail as string | null)
            : ((existing as { location_detail?: string | null }).location_detail ?? null);
        if (nextLocType === "outro" && !String(nextLocDetail ?? "").trim()) {
          return reply.status(400).send({ error: "location_detail é obrigatório quando o local é «Outro»" });
        }

        if (body.photo_urls !== undefined) {
          const parsed = parsePhotoUrls(body.photo_urls);
          if (parsed === "invalid") {
            return reply.status(400).send({
              error: `photo_urls inválido (máximo ${MAX_OCCURRENCE_PHOTOS} URLs, cada uma até ${MAX_PHOTO_URL_LEN} caracteres)`,
            });
          }
          updates.photo_urls = parsed ?? [];
        }

        if (body.contact_id !== undefined) {
          const parsed = parseContactIdForPatch(body.contact_id);
          if (parsed === "invalid") {
            return reply.status(400).send({ error: "contact_id inválido" });
          }
          if (parsed === "clear") {
            updates.contact_id = null;
          } else if (parsed !== "omit") {
            const ok = await assertContactBelongsToTenant(supabase, tenantId, parsed.id);
            if (!ok) return reply.status(400).send({ error: "Cliente inválido ou não pertence ao tenant" });
            updates.contact_id = parsed.id;
          }
        }

        if (Object.keys(updates).length === 0) {
          return reply.status(400).send({ error: "Nenhum campo para atualizar" });
        }

        const { data, error } = await supabase.from("occurrences").update(updates).eq("id", id).select().single();
        if (error) throw error;
        void writeAuditLog({
          tenantId,
          auth,
          resource: "occurrence",
          resourceId: id,
          resourceLabel: (typeof body.title === "string" ? body.title : null) ?? (existing as { title?: string }).title ?? null,
          action: "update",
          metadata: { fields: Object.keys(updates) },
        });
        return reply.send(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("occurrences patch error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  fastify.delete(
    "/occurrences/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;

        const { data: existing, error: exErr } = await supabase
          .from("occurrences")
          .select("tenant_id, title")
          .eq("id", id)
          .maybeSingle();

        if (exErr) throw exErr;
        if (!existing) return reply.status(404).send({ error: "Ocorrência não encontrada" });

        const tenantId = existing.tenant_id as string;
        if (!canAccessTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (!(await canActionViaUserAcl(supabase, tenantId, auth, "delete"))) {
          return reply.status(403).send({ error: "unauthorized" });
        }
        if (await denyIfOccurrencesDisabled(supabase, tenantId, reply)) return;
        if (await denyIfOccurrenceAclDenied(supabase, tenantId, auth, true, reply)) return;

        const { error } = await supabase.from("occurrences").delete().eq("id", id);
        if (error) throw error;
        void writeAuditLog({
          tenantId,
          auth,
          resource: "occurrence",
          resourceId: id,
          resourceLabel: (existing as { title?: string }).title ?? null,
          action: "delete",
        });
        return reply.send({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("occurrences delete error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );
}
