import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  buildAgentMirrorPayload,
  matchesChatwootAccount,
  type AgentMirrorPayload,
  type MirrorToolRow,
} from "../services/chatwoot-agent-mirror.js";
import {
  mergeConfigForEmbedUpdate,
  normalizeEmbedAgentUpdate,
  type EmbedAgentUpdateBody,
} from "../services/chatwoot-embed-update.js";
import { renderChatwootEmbedViewHtml } from "../services/chatwoot-embed-view-html.js";

function getEmbedKey(req: FastifyRequest): string | null {
  const q = (req.query as { key?: string })?.key?.trim();
  if (q) return q;
  const h = req.headers["x-chatwoot-mirror-key"];
  if (typeof h === "string" && h.trim()) return h.trim();
  return null;
}

function assertEmbedKey(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = (process.env.CHATWOOT_MIRROR_EMBED_KEY || "").trim();
  if (!expected) {
    reply.status(503).send({
      error: "CHATWOOT_MIRROR_EMBED_KEY não configurado no servidor (server/.env)",
    });
    return false;
  }
  const got = getEmbedKey(req);
  if (!got || got !== expected) {
    reply.status(401).send({ error: "Chave de espelho inválida ou ausente" });
    return false;
  }
  return true;
}

function publicApiBase(): string {
  return (
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.API_PUBLIC_URL?.trim() ||
    "http://127.0.0.1:3001/api"
  ).replace(/\/+$/, "");
}

function frameAncestorsHeader(): string {
  const raw = (process.env.CHATWOOT_EMBED_FRAME_ANCESTORS || "*").trim();
  if (raw === "*") return "frame-ancestors *";
  const origins = raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length ? `frame-ancestors ${origins.join(" ")}` : "frame-ancestors *";
}

function applyEmbedHeaders(reply: FastifyReply): void {
  reply.header("Content-Security-Policy", frameAncestorsHeader());
}

function publicFrontendBase(): string {
  return (
    process.env.PUBLIC_FRONTEND_URL?.trim() ||
    process.env.VITE_PUBLIC_URL?.trim() ||
    "https://ia.agboom.com.br"
  ).replace(/\/+$/, "");
}

async function loadMirrorAgents(
  supabase: ReturnType<typeof createNexusClient>,
  accountId: string,
  agentIdFilter?: string,
): Promise<{ agents: AgentMirrorPayload[]; error?: string; status?: number }> {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*, tenants(name, slug), providers(name)")
    .order("name", { ascending: true });

  if (error) return { agents: [], error: error.message, status: 500 };

  const matched = (agents ?? []).filter((row) =>
    matchesChatwootAccount((row as { config?: Record<string, unknown> }).config, accountId),
  );

  if (agentIdFilter) {
    const one = matched.find((a) => (a as { id: string }).id === agentIdFilter);
    if (!one) return { agents: [], error: "Agente não encontrado para esta conta Chatwoot", status: 404 };
  }

  const targetAgents = agentIdFilter ? matched.filter((a) => (a as { id: string }).id === agentIdFilter) : matched;
  if (targetAgents.length === 0) {
    return { agents: [] };
  }

  const agentIds = targetAgents.map((a) => (a as { id: string }).id);
  const toolsByAgent = new Map<string, MirrorToolRow[]>();

  const { data: toolLinks, error: toolsErr } = await supabase
    .from("agent_tools")
    .select("agent_id, tools(id, name, description, tool_type)")
    .in("agent_id", agentIds);

  if (toolsErr) return { agents: [], error: toolsErr.message, status: 500 };

  type ToolJoinRow = {
    id: string;
    name: string;
    tool_type: string;
    description: string | null;
  };

  for (const link of toolLinks ?? []) {
    const agentId = (link as { agent_id: string }).agent_id;
    const rawTools = (link as { tools?: ToolJoinRow | ToolJoinRow[] | null }).tools;
    if (!rawTools) continue;
    const tools = Array.isArray(rawTools) ? rawTools : [rawTools];
    const list = toolsByAgent.get(agentId) ?? [];
    for (const tool of tools) {
      list.push({
        id: tool.id,
        name: tool.name,
        tool_type: tool.tool_type,
        description: tool.description,
      });
    }
    toolsByAgent.set(agentId, list);
  }

  const apiBase = publicApiBase();
  const payload = targetAgents.map((row) =>
    buildAgentMirrorPayload(
      row as Parameters<typeof buildAgentMirrorPayload>[0],
      toolsByAgent.get((row as { id: string }).id) ?? [],
      apiBase,
    ),
  );

  return { agents: payload };
}

export async function embedChatwootRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/embed/chatwoot/view",
    async (req: FastifyRequest, reply: FastifyReply) => {
      applyEmbedHeaders(reply);
      if (!getEmbedKey(req)) {
        return reply.status(400).type("text/html").send(
          "<!DOCTYPE html><html><body><p>Parâmetro <code>key</code> ausente na URL.</p></body></html>",
        );
      }
      return reply.type("text/html; charset=utf-8").send(renderChatwootEmbedViewHtml(publicFrontendBase()));
    },
  );

  fastify.get(
    "/embed/chatwoot/agents",
    async (req: FastifyRequest<{ Querystring: { account_id?: string; agent_id?: string } }>, reply: FastifyReply) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) {
        return reply.status(400).send({ error: "account_id é obrigatório (ID da conta Chatwoot)" });
      }

      const supabase = createNexusClient();
      const loaded = await loadMirrorAgents(supabase, accountId, req.query.agent_id?.trim());
      if (loaded.error && loaded.status) {
        return reply.status(loaded.status).send({ error: loaded.error });
      }
      if (loaded.agents.length === 0) {
        return reply.send({
          account_id: accountId,
          agents: [] as AgentMirrorPayload[],
          providers: [],
          message: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
        });
      }

      const { data: providers, error: provErr } = await supabase
        .from("providers")
        .select("id, name")
        .order("name", { ascending: true });

      if (provErr) {
        fastify.log.error({ err: provErr }, "[embed-chatwoot] erro ao listar providers");
        return reply.status(500).send({ error: provErr.message });
      }

      return reply.send({
        account_id: accountId,
        agents: loaded.agents,
        providers: providers ?? [],
        generated_at: new Date().toISOString(),
      });
    },
  );

  fastify.patch(
    "/embed/chatwoot/agents/:agentId",
    async (
      req: FastifyRequest<{
        Params: { agentId: string };
        Querystring: { account_id?: string; key?: string };
        Body: EmbedAgentUpdateBody;
      }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) {
        return reply.status(400).send({ error: "account_id é obrigatório" });
      }

      const agentId = req.params.agentId?.trim();
      if (!agentId) return reply.status(400).send({ error: "agentId inválido" });

      const supabase = createNexusClient();
      const { data: row, error: fetchErr } = await supabase
        .from("agents")
        .select("*, tenants(name, slug), providers(name)")
        .eq("id", agentId)
        .maybeSingle();

      if (fetchErr) return reply.status(500).send({ error: fetchErr.message });
      if (!row) return reply.status(404).send({ error: "Agente não encontrado" });
      if (!matchesChatwootAccount((row as { config?: Record<string, unknown> }).config, accountId)) {
        return reply.status(403).send({ error: "Agente não pertence a esta conta Chatwoot" });
      }

      let normalized;
      try {
        normalized = normalizeEmbedAgentUpdate(req.body ?? {});
      } catch (e) {
        return reply.status(400).send({ error: e instanceof Error ? e.message : "Payload inválido" });
      }

      const currentConfig = ((row as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;
      const mergedConfig =
        normalized.config != null
          ? mergeConfigForEmbedUpdate(currentConfig, normalized.config)
          : currentConfig;

      const updateRow = {
        ...normalized.row,
        ...(normalized.config != null ? { config: mergedConfig } : {}),
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await supabase
        .from("agents")
        .update(updateRow)
        .eq("id", agentId)
        .select("*, tenants(name, slug), providers(name)")
        .single();

      if (updateErr) {
        fastify.log.error({ err: updateErr }, "[embed-chatwoot] erro ao atualizar agente");
        return reply.status(500).send({ error: updateErr.message });
      }

      const { data: toolLinks } = await supabase
        .from("agent_tools")
        .select("agent_id, tools(id, name, description, tool_type)")
        .eq("agent_id", agentId);

      type ToolJoinRow = {
        id: string;
        name: string;
        tool_type: string;
        description: string | null;
      };

      const tools: MirrorToolRow[] = [];
      for (const link of toolLinks ?? []) {
        const rawTools = (link as { tools?: ToolJoinRow | ToolJoinRow[] | null }).tools;
        if (!rawTools) continue;
        const list = Array.isArray(rawTools) ? rawTools : [rawTools];
        for (const tool of list) {
          tools.push({
            id: tool.id,
            name: tool.name,
            tool_type: tool.tool_type,
            description: tool.description,
          });
        }
      }

      const agent = buildAgentMirrorPayload(
        updated as Parameters<typeof buildAgentMirrorPayload>[0],
        tools,
        publicApiBase(),
      );

      return reply.send({ agent, updated_at: new Date().toISOString() });
    },
  );
}
