/**
 * Rotas RAG - ingestão de base de conhecimento (ex.: Vicentim).
 * Padrão igual ao inventory/sync: endpoint HTTP chamado por cron externo (cron-job.org).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { runVicentimIngest } from "../services/rag-ingest-vicentim.js";

export async function ragRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/rag/ingest-vicentim
   * Scrape + ingest do site Vicentim Maekawa no RAG.
   * Chamado por cron (ex.: cron-job.org) — retorna 202 imediato e processa em background
   * para evitar timeout do cron. Query: ?page_offset=0&page_limit=5 (opcional)
   */
  fastify.post("/rag/ingest-vicentim", async (req: FastifyRequest, reply: FastifyReply) => {
    const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
    const supabase = createNexusClient(nexusAuth);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return reply.status(500).send({ success: false, error: "OPENAI_API_KEY não configurado" });
    }

    const pageOffset = parseInt((req.query as { page_offset?: string })?.page_offset || "0", 10);
    const pageLimit = (req.query as { page_limit?: string })?.page_limit
      ? parseInt((req.query as { page_limit: string }).page_limit, 10)
      : undefined;

    reply.code(202).send({
      success: true,
      message: "Ingest iniciado em background",
      pageOffset: isNaN(pageOffset) ? 0 : pageOffset,
      pageLimit: pageLimit && !isNaN(pageLimit) ? pageLimit : undefined,
    });

    runVicentimIngest(supabase, openaiKey, {
      pageOffset: isNaN(pageOffset) ? 0 : pageOffset,
      pageLimit: pageLimit && !isNaN(pageLimit) ? pageLimit : undefined,
    })
      .then((result) => {
        fastify.log.info(
          { pagesProcessed: result.pagesProcessed, chunksInserted: result.chunksInserted, errors: result.errors },
          "RAG ingest Vicentim concluído"
        );
      })
      .catch((err: unknown) => {
        fastify.log.error(err, "RAG ingest Vicentim falhou");
      });
  });
}
