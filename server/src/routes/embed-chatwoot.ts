import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  buildAgentMirrorPayload,
  matchesChatwootAccount,
  type AgentMirrorPayload,
  type MirrorToolRow,
} from "../services/chatwoot-agent-mirror.js";

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

export async function embedChatwootRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/embed/chatwoot/agents",
    async (req: FastifyRequest<{ Querystring: { account_id?: string; agent_id?: string } }>, reply: FastifyReply) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) {
        return reply.status(400).send({ error: "account_id é obrigatório (ID da conta Chatwoot)" });
      }

      const agentIdFilter = req.query.agent_id?.trim();
      const supabase = createNexusClient();

      const { data: agents, error } = await supabase
        .from("agents")
        .select("*, tenants(name, slug), providers(name)")
        .order("name", { ascending: true });

      if (error) {
        fastify.log.error({ err: error }, "[embed-chatwoot] erro ao listar agentes");
        return reply.status(500).send({ error: error.message });
      }

      const matched = (agents ?? []).filter((row) =>
        matchesChatwootAccount((row as { config?: Record<string, unknown> }).config, accountId),
      );

      if (agentIdFilter) {
        const one = matched.find((a) => (a as { id: string }).id === agentIdFilter);
        if (!one) {
          return reply.status(404).send({ error: "Agente não encontrado para esta conta Chatwoot" });
        }
      }

      const targetAgents = agentIdFilter ? matched.filter((a) => (a as { id: string }).id === agentIdFilter) : matched;

      if (targetAgents.length === 0) {
        return reply.send({
          account_id: accountId,
          agents: [] as AgentMirrorPayload[],
          message: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
        });
      }

      const agentIds = targetAgents.map((a) => (a as { id: string }).id);
      const toolsByAgent = new Map<string, MirrorToolRow[]>();

      const { data: toolLinks, error: toolsErr } = await supabase
        .from("agent_tools")
        .select("agent_id, tools(id, name, description, tool_type)")
        .in("agent_id", agentIds);

      if (toolsErr) {
        fastify.log.error({ err: toolsErr }, "[embed-chatwoot] erro ao carregar tools");
        return reply.status(500).send({ error: toolsErr.message });
      }

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
      const payload: AgentMirrorPayload[] = targetAgents.map((row) =>
        buildAgentMirrorPayload(
          row as Parameters<typeof buildAgentMirrorPayload>[0],
          toolsByAgent.get((row as { id: string }).id) ?? [],
          apiBase,
        ),
      );

      return reply.send({
        account_id: accountId,
        agents: payload,
        generated_at: new Date().toISOString(),
      });
    },
  );
}
