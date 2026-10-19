import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";

const DIVINO_SLUGS = ["divino-chale", "divinochale"] as const;

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
      const action = String(body.action || "check_lodging");
      const args: Record<string, unknown> = { ...body, action, tenant_id: tenantId };
      delete args.slug;
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
