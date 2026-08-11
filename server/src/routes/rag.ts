/**
 * Rotas RAG - gerenciamento de documentos e ingestão de base de conhecimento.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { runVicentimIngest } from "../services/rag-ingest-vicentim.js";
import { ingestPdfDocument } from "../services/rag-document-ingest.js";

export async function ragRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/rag/ingest-vicentim
   * Scrape + ingest do site Vicentim Maekawa no RAG.
   */
  fastify.post("/rag/ingest-vicentim", async (req: FastifyRequest, reply: FastifyReply) => {
    const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
    const supabase = createNexusClient(nexusAuth);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return reply.status(500).send({ success: false, error: "OPENAI_API_KEY não configurado" });
    }

    const pageOffset = parseInt((req.query as { page_offset?: string })?.page_offset || "0", 10);
    const pageLimitRaw = (req.query as { page_limit?: string })?.page_limit;
    const pageLimit = pageLimitRaw ? parseInt(pageLimitRaw, 10) : 5;

    reply.code(202).send({
      success: true,
      message: "Ingest iniciado em background",
      pageOffset: isNaN(pageOffset) ? 0 : pageOffset,
      pageLimit: isNaN(pageLimit) ? 5 : pageLimit,
    });

    runVicentimIngest(supabase, openaiKey, {
      pageOffset: isNaN(pageOffset) ? 0 : pageOffset,
      pageLimit: isNaN(pageLimit) ? 5 : pageLimit,
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

  /**
   * GET /api/agents/:agentId/documents
   * Lista todos os documentos da base de conhecimento de um agente.
   */
  fastify.get(
    "/agents/:agentId/documents",
    async (
      req: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId } = req.params;
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);

      const { data, error } = await supabase.rpc("list_agent_documents", {
        p_agent_id: agentId,
      });

      if (error) {
        return reply.status(500).send({ success: false, error: error.message });
      }

      return { success: true, documents: data || [] };
    }
  );

  /**
   * POST /api/agents/:agentId/documents/ingest
   * Recebe um PDF recém-salvo no Supabase Storage e inicia a extração e vetorização em background.
   */
  fastify.post(
    "/agents/:agentId/documents/ingest",
    async (
      req: FastifyRequest<{
        Params: { agentId: string };
        Body: { filePath: string; originalName: string };
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = req.params;
      const { filePath, originalName } = req.body;
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);

      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return reply.status(500).send({ success: false, error: "OPENAI_API_KEY não configurado" });
      }

      if (!filePath || !originalName) {
        return reply.status(400).send({ success: false, error: "filePath e originalName são obrigatórios" });
      }

      // Retorna 202 imediatamente para evitar timeout de upload/processamento
      reply.code(202).send({
        success: true,
        message: "Ingestão de documento iniciada em background",
      });

      // Roda em background
      ingestPdfDocument(supabase, {
        agentId,
        filePath,
        originalName,
        openaiKey,
      })
        .then((result) => {
          if (result.success) {
            fastify.log.info(`Documento RAG ${originalName} processado com sucesso. ${result.chunksCount} chunks criados.`);
          } else {
            fastify.log.error(`Erro no processamento RAG do documento ${originalName}: ${result.error}`);
          }
        })
        .catch((err) => {
          fastify.log.error(err, `Erro fatal em background RAG ${originalName}`);
        });
    }
  );

  /**
   * DELETE /api/agents/:agentId/documents/:documentId
   * Deleta um documento do banco (e seus chunks) e do Supabase Storage.
   */
  fastify.delete(
    "/agents/:agentId/documents/:documentId",
    async (
      req: FastifyRequest<{ Params: { agentId: string; documentId: string }; Querystring: { filePath?: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId, documentId } = req.params;
      const { filePath } = req.query;
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);

      // Deleta do banco (em cascata no postgres deletará chunks também)
      const { error: dbErr } = await supabase.rpc("delete_agent_document", {
        p_agent_id: agentId,
        p_document_id: documentId,
      });

      if (dbErr) {
        return reply.status(500).send({ success: false, error: dbErr.message });
      }

      // Se filePath for fornecido, remove do Storage do Supabase também
      if (filePath) {
        const { error: storageErr } = await supabase.storage
          .from("agent-documents")
          .remove([filePath]);

        if (storageErr) {
          fastify.log.warn(`Não foi possível remover o arquivo ${filePath} do storage: ${storageErr.message}`);
        }
      }

      return { success: true, message: "Documento excluído com sucesso" };
    }
  );

  /**
   * GET /api/agents/:agentId/documents/:documentId/chunks
   * Retorna todos os chunks de um documento específico para visualização.
   */
  fastify.get(
    "/agents/:agentId/documents/:documentId/chunks",
    async (
      req: FastifyRequest<{ Params: { agentId: string; documentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId, documentId } = req.params;
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);

      const { data, error } = await supabase.rpc("list_document_chunks", {
        p_agent_id: agentId,
        p_document_id: documentId,
      });

      if (error) {
        return reply.status(500).send({ success: false, error: error.message });
      }

      return { success: true, chunks: data || [] };
    }
  );
}
