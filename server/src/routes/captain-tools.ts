import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";
import { getChatwootAuthHeaders } from "../services/delivery.js";
import { buildHandoffNotification } from "../utils/agendaNotification.js";
import { parseLodgingStayArgs } from "../utils/lodging-calendar-availability.js";

const DIVINO_SLUGS = ["divino-chale", "divinochale"] as const;

const PLURAX_BASE_URL =
  process.env.PLURAX_BASE_URL || "https://www.plurax.com.br/plurax/mcp/v1";
const PLURAX_COMPANY_ID = Number(process.env.PLURAX_COMPANY_ID || 5);
const PLURAX_TENANT_ID = Number(process.env.PLURAX_TENANT_ID || 5);
const PLURAX_SLUG = process.env.PLURAX_SLUG || "divino-chale";

const DEFAULT_DIVINO_PHOTO_URLS = [
  "https://www.plurax.com.br/web/image/hotel.room.image/4/image_1920",
  "https://www.plurax.com.br/web/image/hotel.room.image/5/image_1920",
  "https://www.plurax.com.br/web/image/hotel.room.image/6/image_1920",
  "https://www.plurax.com.br/web/image/hotel.room.image/7/image_1920",
  "https://www.plurax.com.br/web/image/hotel.room.image/8/image_1920",
] as const;

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

/**
 * Doc Mega: conversation_message_send + media_urls (account 17 / divino_chale).
 */
async function sendDivinoPhotosViaMegaMcp(
  conversationId: number,
  fotos: string[],
  caption: string,
): Promise<number> {
  const mcpToken =
    process.env.DIVINO_CHALE_MEGA_MCP_TOKEN || process.env.CHATWOOT_API_TOKEN;
  if (!mcpToken) return 0;

  const base = (process.env.CHATWOOT_BASE_URL || "https://mega.atendai.app").replace(
    /\/+$/,
    "",
  );
  const mcpUrl =
    process.env.DIVINO_CHALE_MEGA_MCP_URL || `${base}/mcp/17/divino_chale`;

  let enviadas = 0;
  for (let i = 0; i < fotos.length; i++) {
    const payload = {
      jsonrpc: "2.0",
      id: i + 1,
      method: "tools/call",
      params: {
        name: "conversation_message_send",
        arguments: {
          conversation_id: String(conversationId),
          content: i === 0 ? caption : "",
          media_urls: [fotos[i]],
        },
      },
    };
    const resp = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Access-Token": mcpToken,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) continue;
    const data = (await resp.json()) as {
      error?: unknown;
      result?: {
        structuredContent?: { ok?: boolean; body?: { attachments?: unknown[] } };
        content?: Array<{ text?: string }>;
      };
    };
    if (data.error) continue;
    const atts = data.result?.structuredContent?.body?.attachments;
    if (Array.isArray(atts) && atts.length > 0) {
      enviadas += atts.length;
      continue;
    }
    const blob = (data.result?.content || []).map((c) => c.text || "").join(" ");
    if (blob.includes('"file_type": "image"') || data.result?.structuredContent?.ok) {
      enviadas += 1;
    }
  }
  return enviadas;
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
 * POST /api/captain-tools/divino-chale/enviar-fotos  { conversation_id, caption?, foto_urls? }
 *   Envia fotos do chalé no WhatsApp via Mega MCP (media_urls).
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

  fastify.post("/captain-tools/divino-chale/enviar-fotos", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!checkBearer(req, reply)) return;
    try {
      const body = (req.body || {}) as {
        conversation_id?: number | string;
        caption?: string;
        foto_urls?: string[] | string;
      };

      const headerConvId = req.headers["x-chatwoot-conversation-id"];
      const bodyConv = body.conversation_id != null ? Number(body.conversation_id) : 0;
      const headerConv = headerConvId ? Number(headerConvId) : 0;
      const conversationId =
        bodyConv > 0 && !Number.isNaN(bodyConv)
          ? bodyConv
          : headerConv > 0 && !Number.isNaN(headerConv)
            ? headerConv
            : null;
      if (!conversationId) {
        return reply.status(400).send({
          error: "conversation_id obrigatório",
          instrucao_ia:
            "Passe conversation_id da conversa atual. Não cole URL de foto no chat.",
        });
      }

      const rawFotos = body.foto_urls;
      let fotos: string[];
      if (rawFotos == null || (Array.isArray(rawFotos) && rawFotos.length === 0)) {
        fotos = [...DEFAULT_DIVINO_PHOTO_URLS];
      } else if (typeof rawFotos === "string") {
        fotos = rawFotos
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!fotos.length) fotos = [...DEFAULT_DIVINO_PHOTO_URLS];
      } else {
        fotos = rawFotos.map((s) => String(s).trim()).filter(Boolean);
        if (!fotos.length) fotos = [...DEFAULT_DIVINO_PHOTO_URLS];
      }

      const caption = (body.caption || "").trim();

      let enviadas = 0;
      try {
        enviadas = await sendDivinoPhotosViaMegaMcp(conversationId, fotos, caption);
      } catch (err) {
        req.log?.warn?.({ err }, "[Divino Chalé] MCP media_urls falhou");
      }

      if (enviadas === 0) {
        return reply.send({
          success: false,
          enviadas: 0,
          total_solicitadas: fotos.length,
          via: "mcp_media_urls",
          instrucao_ia:
            "As fotos não subiram. NÃO cole URL. Diga em 1 frase curta que vai mandar de novo e chame a tool outra vez.",
        });
      }

      return reply.send({
        success: true,
        enviadas,
        total_solicitadas: fotos.length,
        via: "mcp_media_urls",
        instrucao_ia:
          "Fotos já foram enviadas como imagem no WhatsApp. Confirme em 1 frase curta e faça 1 pergunta leve. NÃO cole URL.",
      });
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
