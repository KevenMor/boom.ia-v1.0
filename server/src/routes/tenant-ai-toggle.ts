import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getToggleSecret(req: FastifyRequest): string | null {
  const h = req.headers["x-tenant-ai-toggle-secret"];
  if (typeof h === "string" && h.trim()) return h.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function assertSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = (process.env.TENANT_AI_TOGGLE_SECRET || "").trim();
  if (!expected) {
    reply.status(503).send({ error: "TENANT_AI_TOGGLE_SECRET não configurado no servidor" });
    return false;
  }
  const got = getToggleSecret(req);
  if (!got || got !== expected) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/** Dashboard Mega: controla status dos agentes (active/inactive), não tenants.ai_globally_enabled. */
export async function tenantAiToggleRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/tenant-ai/status",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      if (!assertSecret(req, reply)) return;
      const tenantId = req.query?.tenant_id?.trim();
      if (!tenantId || !UUID_RE.test(tenantId)) {
        return reply.status(400).send({ error: "tenant_id UUID inválido ou ausente" });
      }
      const supabase = createNexusClient();
      const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle();
      if (tErr) {
        return reply.status(500).send({ error: tErr.message });
      }
      if (!tenant) {
        return reply.status(404).send({ error: "Tenant não encontrado" });
      }
      const { data: agents, error: aErr } = await supabase.from("agents").select("id, status").eq("tenant_id", tenantId);
      if (aErr) {
        return reply.status(500).send({ error: aErr.message });
      }
      const rows = agents ?? [];
      const total = rows.length;
      const activeCount = rows.filter((r) => r.status === "active").length;
      const agents_all_active = total > 0 && activeCount === total;
      return reply.send({
        tenant_id: tenantId,
        agents_total: total,
        agents_active_count: activeCount,
        agents_all_active,
      });
    }
  );

  fastify.post(
    "/tenant-ai/toggle",
    async (
      req: FastifyRequest<{ Body: { tenant_id?: string; enabled?: boolean } }>,
      reply: FastifyReply
    ) => {
      if (!assertSecret(req, reply)) return;
      const tenantId = typeof req.body?.tenant_id === "string" ? req.body.tenant_id.trim() : "";
      const enabled = req.body?.enabled;
      if (!tenantId || !UUID_RE.test(tenantId)) {
        return reply.status(400).send({ error: "tenant_id UUID inválido ou ausente" });
      }
      if (typeof enabled !== "boolean") {
        return reply.status(400).send({ error: "enabled deve ser boolean (true = todos os agentes ativos)" });
      }
      const supabase = createNexusClient();
      const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle();
      if (tErr) {
        return reply.status(500).send({ error: tErr.message });
      }
      if (!tenant) {
        return reply.status(404).send({ error: "Tenant não encontrado" });
      }
      const newStatus = enabled ? "active" : "inactive";
      const now = new Date().toISOString();
      const { data: updated, error: uErr } = await supabase
        .from("agents")
        .update({ status: newStatus, updated_at: now })
        .eq("tenant_id", tenantId)
        .select("id, status");

      if (uErr) {
        return reply.status(500).send({ error: uErr.message });
      }
      const list = updated ?? [];
      const total = list.length;
      const activeCount = list.filter((r) => r.status === "active").length;
      return reply.send({
        ok: true,
        tenant_id: tenantId,
        updated_count: total,
        agents_total: total,
        agents_active_count: activeCount,
        agents_all_active: total > 0 && activeCount === total,
      });
    }
  );
}
