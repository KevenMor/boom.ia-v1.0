import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";
import { parseLodgingStayArgs } from "../utils/lodging-calendar-availability.js";

const DIVINO_SLUGS = ["divino-chale", "divinochale"] as const;

const PLURAX_BASE_URL =
  process.env.PLURAX_BASE_URL || "https://www.plurax.com.br/plurax/mcp/v1";
const PLURAX_COMPANY_ID = Number(process.env.PLURAX_COMPANY_ID || 5);
const PLURAX_TENANT_ID = Number(process.env.PLURAX_TENANT_ID || 5);
const PLURAX_SLUG = process.env.PLURAX_SLUG || "divino-chale";

async function pluraxFetch(
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const token = process.env.PLURAX_MCP_TOKEN;
  if (!token) throw new Error("PLURAX_MCP_TOKEN não configurado no servidor");
  const res = await fetch(`${PLURAX_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function checkBearer(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.CAPTAIN_TOOLS_TOKEN;
  if (!expected) {
    reply.status(500).send({ error: "CAPTAIN_TOOLS_TOKEN não configurado no servidor" });
    return false;
  }
  const auth = String(req.headers.authorization || "");
  if (auth !== `Bearer ${expected}`) {
    reply.status(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

async function resolveTenantId(supabase: ReturnType<typeof createNexusClient>, slug?: string) {
  const wanted = String(slug || "divino-chale").toLowerCase();
  const { data } = await supabase.from("tenants").select("id, slug").in("slug", [...DIVINO_SLUGS]);
  if (!data?.length) return null;
  const exact = data.find((t) => t.slug === wanted);
  const divino = data.find((t) => t.slug === "divino-chale");
  return (exact || divino || data[0])?.id ?? null;
}

async function loadToolByType(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  toolType: string
): Promise<ToolDef | null> {
  const { data, error } = await supabase
    .from("tools")
    .select("id, name, tool_type, tenant_id, execution_config, function_def")
    .eq("tenant_id", tenantId)
    .eq("tool_type", toolType)
    .limit(5);
  if (error || !data?.length) return null;
  const preferred = (data as ToolDef[]).find((t) =>
    toolType === "calendar_query"
      ? /consultar_evento/i.test(t.name)
      : toolType === "chatwoot_assign"
        ? /encaminhar_atendente/i.test(t.name)
        : true
  );
  return preferred || (data as ToolDef[])[0];
}

async function resolveAgentId(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  toolId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("agent_tools")
    .select("agent_id, agents!inner(tenant_id)")
    .eq("tool_id", toolId)
    .limit(1)
    .maybeSingle();
  const linked = (data as { agent_id?: string } | null)?.agent_id;
  if (linked) return linked;
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  return (agent as { id?: string } | null)?.id ?? null;
}

/**
 * Ponte HTTP para o Captain (Chatwoot/Mega) chamar as tools da Lara.
 * Auth: Authorization: Bearer <CAPTAIN_TOOLS_TOKEN>.
 *
 * POST /api/captain-tools/calendar  { slug?, action, check_in?, check_out?, ... }
 * POST /api/captain-tools/gallery   { slug?, nome? }
 * POST /api/captain-tools/handoff   { slug?, reason?, chatwoot_conversation_id?, conversation_id? }
 * POST /api/captain-tools/plurax    { operation, model?, domain?, fields?, ids?, limit?, order?, values?, method?, args?, kwargs? }
 *   Proxy escopado no Divino Chalé (company_id 5, tenant_id 5, slug divino-chale).
 */
export async function captainToolsRoutes(fastify: FastifyInstance) {
  fastify.post("/captain-tools/calendar", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkBearer(req, reply)) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const supabase = createNexusClient();
      const tenantId = await resolveTenantId(supabase, body.slug as string | undefined);
      if (!tenantId) return reply.status(404).send({ error: "tenant divino-chale não encontrado" });
      const tool = await loadToolByType(supabase, tenantId, "calendar_query");
      if (!tool) return reply.status(404).send({ error: "tool calendar_query não registrada para o tenant" });
      const agentId = await resolveAgentId(supabase, tenantId, tool.id);
      if (!agentId) return reply.status(404).send({ error: "agente vinculado à tool não encontrado" });
      let action = String(
        body.action ?? body.acao ?? body.tool_action ?? body.operation ?? "sugerir_datas",
      ).toLowerCase();
      if (action === "check_availability" || action === "check_stay" || action === "verificar") action = "check_lodging";
      const args: Record<string, unknown> = { ...body, action, tenant_id: tenantId };
      delete args.slug;
      if (action === "check_lodging" && !parseLodgingStayArgs(args)) {
        args.action = "sugerir_datas";
        if (args.preference == null) args.preference = "any";
        if (args.limit == null) args.limit = 3;
      }
      const out = await executeTool(tool, args, agentId);
      return reply.send({ success: out.success, result: out.result, error: out.error ?? null });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
    }
  });

  fastify.post("/captain-tools/gallery", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkBearer(req, reply)) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const supabase = createNexusClient();
      const tenantId = await resolveTenantId(supabase, body.slug as string | undefined);
      if (!tenantId) return reply.status(404).send({ error: "tenant divino-chale não encontrado" });
      const tool = await loadToolByType(supabase, tenantId, "suite_gallery_query");
      const toolDef: ToolDef = tool || {
        id: "builtin-suite-gallery-query",
        name: "suite_gallery_query",
        tool_type: "suite_gallery_query",
        tenant_id: tenantId,
        execution_config: {},
      };
      let agentId: string | null = null;
      if (tool) agentId = await resolveAgentId(supabase, tenantId, tool.id);
      if (!agentId) {
        const { data: agentRow } = await supabase
          .from("agents")
          .select("id")
          .eq("tenant_id", tenantId)
          .limit(1)
          .maybeSingle();
        agentId = (agentRow as { id?: string } | null)?.id ?? null;
      }
      if (!agentId) return reply.status(404).send({ error: "agente do tenant não encontrado" });
      const args: Record<string, unknown> = { ...body, tenant_id: tenantId };
      delete args.slug;
      const out = await executeTool(toolDef, args, agentId);
      return reply.send({ success: out.success, result: out.result, error: out.error ?? null });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
    }
  });

  fastify.post("/captain-tools/plurax", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkBearer(req, reply)) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const operation = String(
        body.operation ?? body.action ?? body.op ?? "search_read",
      ).toLowerCase();
      const model = String(body.model ?? "hotel.reservation");
      const scoped = {
        company_id: PLURAX_COMPANY_ID,
        tenant_id: PLURAX_TENANT_ID,
        slug: PLURAX_SLUG,
      };
      if (operation === "models") {
        const out = await pluraxFetch(`/orm/models?slug=${encodeURIComponent(PLURAX_SLUG)}`, "GET");
        return reply.status(out.status).send(out.data);
      }
      if (!["search_read", "read", "create", "write", "call"].includes(operation)) {
        return reply.status(400).send({ error: `operation inválida: ${operation}` });
      }
      const payload: Record<string, unknown> = { ...body, ...scoped, model };
      delete payload.slug;
      delete payload.operation;
      delete payload.action;
      delete payload.op;
      for (const key of ["domain", "fields", "ids", "values", "args", "kwargs"]) {
        const val = payload[key];
        if (typeof val === "string" && val.trim()) {
          try {
            payload[key] = JSON.parse(val);
          } catch {
            // mantém como string; o Plurax responde o erro
          }
        }
      }
      if (operation === "search_read") {
        if (payload.limit == null) payload.limit = 20;
        if (!Array.isArray(payload.fields)) payload.fields = ["id"];
      }
      if ((operation === "create" || operation === "write" || operation === "call") && payload.confirm == null) {
        payload.confirm = true;
      }
      const out = await pluraxFetch(`/orm/${operation}`, "POST", payload);
      return reply.status(out.status).send(out.data);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
    }
  });

  fastify.post("/captain-tools/handoff", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkBearer(req, reply)) return;
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const supabase = createNexusClient();
      const tenantId = await resolveTenantId(supabase, body.slug as string | undefined);
      if (!tenantId) return reply.status(404).send({ error: "tenant divino-chale não encontrado" });
      const tool = await loadToolByType(supabase, tenantId, "chatwoot_assign");
      if (!tool) return reply.status(404).send({ error: "tool chatwoot_assign não registrada para o tenant" });
      const agentId = await resolveAgentId(supabase, tenantId, tool.id);
      if (!agentId) return reply.status(404).send({ error: "agente vinculado à tool não encontrado" });
      const args: Record<string, unknown> = { ...body, tenant_id: tenantId };
      delete args.slug;
      const out = await executeTool(tool, args, agentId);
      return reply.send({ success: out.success, result: out.result, error: out.error ?? null });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
    }
  });
}
