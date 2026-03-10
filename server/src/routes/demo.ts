import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";

/**
 * Rotas públicas para o demo/sandbox de agentes (sem Edge Functions).
 * Tudo é atendido pelo backend Node.js.
 */

export async function demoRoutes(fastify: FastifyInstance) {
  /**
   * GET /demo/public-agent-info?agent_id=xxx
   * Retorna dados públicos do agente para a página de demo (nome, avatar, config sandbox, tenant).
   * Não exige autenticação.
   */
  fastify.get(
    "/demo/public-agent-info",
    async (
      req: FastifyRequest<{ Querystring: { agent_id?: string } }>,
      reply: FastifyReply
    ) => {
      const agentId = req.query.agent_id;
      if (!agentId) {
        return reply.status(400).send({ error: "agent_id is required" });
      }

      const supabase = createNexusClient();

      const { data, error } = await supabase
        .from("agents")
        .select("id, name, avatar_url, config, tenants(name, slug)")
        .eq("id", agentId)
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const publicInfo = {
        id: data.id,
        name: data.name,
        avatar_url: data.avatar_url,
        config: {
          sandbox_password: (data.config as Record<string, unknown>)?.sandbox_password ?? null,
        },
        tenants: data.tenants,
      };

      return reply.send(publicInfo);
    }
  );
}
