import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AS_VEICULOS_INBOX_ID,
  handleAsVeiculosAssignmentWebhook,
  syncMegaCrmAssigneeLabel,
  syncWahaAssigneeLabel,
  toWahaChatId,
  type MegaAssignmentPayload,
} from "../services/as-veiculos-waha-labels.js";

function assertWebhookSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.AS_VEICULOS_WAHA_LABELS_WEBHOOK_SECRET || "";
  if (!expected) {
    reply.status(500).send({ error: "AS_VEICULOS_WAHA_LABELS_WEBHOOK_SECRET não configurado" });
    return false;
  }
  const q = (req.query || {}) as Record<string, unknown>;
  const header = String(req.headers["x-asv-waha-secret"] || "");
  const token = String(q.token || q.secret || header || "");
  if (token !== expected) {
    reply.status(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

/**
 * Webhook Mega (account 20) → etiqueta WhatsApp WAHA + label CRM por assignee.
 *
 * POST /api/webhooks/mega/as-veiculos/assignment-labels?token=SECRET
 * POST /api/webhooks/mega/as-veiculos/assignment-labels/backfill?token=SECRET
 *   body opcional: { conversation_id, assignee_id, source_id, phone }
 */
export async function asVeiculosWahaLabelsRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/webhooks/mega/as-veiculos/assignment-labels",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!assertWebhookSecret(req, reply)) return;
      try {
        const payload = (req.body || {}) as MegaAssignmentPayload;
        const result = await handleAsVeiculosAssignmentWebhook(payload);
        return reply.send({ ok: true, ...result });
      } catch (err) {
        console.error("[ASV WAHA labels] webhook error:", (err as Error)?.message);
        return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
      }
    },
  );

  fastify.post(
    "/webhooks/mega/as-veiculos/assignment-labels/backfill",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!assertWebhookSecret(req, reply)) return;
      try {
        const body = (req.body || {}) as {
          conversation_id?: number | string;
          assignee_id?: number | null;
          source_id?: string;
          phone?: string;
          inbox_id?: number;
        };
        if (body.inbox_id && Number(body.inbox_id) !== AS_VEICULOS_INBOX_ID) {
          return reply.status(400).send({ error: "inbox_id inválido" });
        }
        const conversationId = body.conversation_id;
        if (conversationId == null) {
          return reply.status(400).send({ error: "conversation_id obrigatório" });
        }
        const chatId = toWahaChatId(body.source_id, body.phone);
        if (!chatId) {
          return reply.status(400).send({ error: "source_id ou phone obrigatório" });
        }
        const assigneeId = body.assignee_id === undefined ? null : body.assignee_id;
        const waha = await syncWahaAssigneeLabel(chatId, assigneeId);
        const mega = await syncMegaCrmAssigneeLabel(conversationId, assigneeId);
        return reply.send({ ok: true, conversationId, assigneeId, chatId, waha, mega });
      } catch (err) {
        console.error("[ASV WAHA labels] backfill error:", (err as Error)?.message);
        return reply.status(500).send({ error: (err as Error)?.message || "internal error" });
      }
    },
  );
}
