import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { canAccessTenant, getBearerToken, requireAuthenticated } from "../services/authorization.js";
import { createNexusClient } from "../services/supabase.js";
import {
  addFinanceiroCampaignJob,
  getFinanceiroCampaignBullJob,
  getFinanceiroCampaignQueue,
  type FinanceiroCampaignJobPayload,
} from "../services/financeiro-campaign-queue.js";
import { createMemoryFinanceiroJob, getMemoryFinanceiroJob } from "../services/financeiro-campaign-memory.js";
import type { FinanceiroCampaignResult } from "../services/financeiro-campaign-runner.js";

interface CampaignContact {
  name: string;
  phone: string;
  value: string;
  due_date: string;
  status?: string;
}

export type CampaignStatusBody =
  | { status: "queued" | "running"; progress?: { index: number; total: number; sent: number; failed: number } }
  | { status: "completed"; result: FinanceiroCampaignResult }
  | { status: "failed"; error: string };

export async function financeiroRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/financeiro/campaign-runs",
    async (
      req: FastifyRequest<{ Querystring: { tenant_id?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      const ctx = await requireAuthenticated(req, reply);
      if (!ctx) return reply;

      const tenantId = String(req.query?.tenant_id || "").trim();
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id e obrigatorio." });
      }
      if (!canAccessTenant(ctx, tenantId)) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const rawLimit = Number(req.query?.limit ?? 30);
      const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 30;

      const supabase = createNexusClient(getBearerToken(req));
      /** Lista leve: sem coluna `results` (JSON grande) — detalhe em GET /financeiro/campaign-run/:id */
      const { data, error } = await supabase
        .from("financeiro_campaign_runs")
        .select("id, tenant_id, agent_id, job_id, message_template, status, summary, error_message, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ runs: data ?? [] });
    }
  );

  fastify.get(
    "/financeiro/campaign-run/:runId",
    async (req: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const ctx = await requireAuthenticated(req, reply);
      if (!ctx) return reply;

      const runId = String(req.params.runId || "").trim();
      if (!runId) {
        return reply.status(400).send({ error: "run_id invalido." });
      }

      const supabase = createNexusClient(getBearerToken(req));
      const { data, error } = await supabase
        .from("financeiro_campaign_runs")
        .select(
          "id, tenant_id, agent_id, job_id, message_template, status, summary, results, error_message, created_at"
        )
        .eq("id", runId)
        .maybeSingle();

      if (error) {
        return reply.status(500).send({ error: error.message });
      }
      if (!data) {
        return reply.status(404).send({ error: "registro nao encontrado." });
      }
      if (!canAccessTenant(ctx, data.tenant_id as string)) {
        return reply.status(403).send({ error: "forbidden" });
      }

      return reply.send({ run: data });
    }
  );

  fastify.get(
    "/financeiro/campaign/:jobId/status",
    async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const ctx = await requireAuthenticated(req, reply);
      if (!ctx) return reply;

      const jobId = String(req.params.jobId || "").trim();
      if (!jobId) {
        return reply.status(400).send({ error: "job_id invalido." });
      }

      const mem = getMemoryFinanceiroJob(jobId, ctx.userId);
      if (mem) {
        if (mem.status === "completed" && mem.result) {
          return reply.send({ status: "completed", result: mem.result } satisfies CampaignStatusBody);
        }
        if (mem.status === "failed") {
          return reply.send({ status: "failed", error: mem.error || "unknown" } satisfies CampaignStatusBody);
        }
        const st = mem.status === "queued" ? "queued" : "running";
        return reply.send({ status: st, progress: mem.progress } satisfies CampaignStatusBody);
      }

      const bullJob = await getFinanceiroCampaignBullJob(jobId);
      if (!bullJob) {
        return reply.status(404).send({ error: "job nao encontrado." });
      }

      const payload = bullJob.data as FinanceiroCampaignJobPayload;
      if (payload.userId !== ctx.userId) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const state = await bullJob.getState();
      if (state === "completed") {
        const rv = bullJob.returnvalue as FinanceiroCampaignResult | undefined;
        if (!rv) {
          return reply.send({ status: "failed", error: "resultado ausente" } satisfies CampaignStatusBody);
        }
        return reply.send({ status: "completed", result: rv } satisfies CampaignStatusBody);
      }
      if (state === "failed") {
        return reply.send({
          status: "failed",
          error: bullJob.failedReason || "job falhou",
        } satisfies CampaignStatusBody);
      }

      const prog = bullJob.progress as { index?: number; total?: number; sent?: number; failed?: number } | undefined;
      const st = state === "active" ? "running" : "queued";
      return reply.send({
        status: st,
        progress:
          prog && typeof prog.total === "number"
            ? {
                index: typeof prog.index === "number" ? prog.index : 0,
                total: prog.total,
                sent: typeof prog.sent === "number" ? prog.sent : 0,
                failed: typeof prog.failed === "number" ? prog.failed : 0,
              }
            : undefined,
      } satisfies CampaignStatusBody);
    }
  );

  fastify.post(
    "/financeiro/send-campaign",
    async (
      req: FastifyRequest<{
        Body: {
          contacts: CampaignContact[];
          message_template: string;
          inbox_id?: number;
          agent_id: string;
          delay_min_ms: number;
          delay_max_ms: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const ctx = await requireAuthenticated(req, reply);
      if (!ctx) return reply;

      const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
      const messageTemplate = String(req.body?.message_template || "").trim();
      const agentId = String(req.body?.agent_id || "").trim();
      const delayMinMs = Number(req.body?.delay_min_ms ?? 0);
      const delayMaxMs = Number(req.body?.delay_max_ms ?? delayMinMs);

      if (!agentId || !messageTemplate || contacts.length === 0) {
        return reply.status(400).send({ error: "agent_id, message_template e contacts sao obrigatorios." });
      }

      const supabase = createNexusClient(getBearerToken(req));
      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, tenant_id, config")
        .eq("id", agentId)
        .maybeSingle();

      if (agentErr || !agent) {
        return reply.status(404).send({ error: "Agente nao encontrado." });
      }
      if (!canAccessTenant(ctx, agent.tenant_id as string | null | undefined)) {
        return reply.status(403).send({ error: "forbidden" });
      }

      const cfg = (agent.config || {}) as Record<string, unknown>;
      const wahaUrl = String(cfg.waha_url || "").replace(/\/+$/, "").trim();
      const wahaApiKey = String(cfg.waha_api_key || "").trim();

      const chatwootUrl = String(cfg.chatwoot_url || "").replace(/\/+$/, "");
      const chatwootApiToken = String(cfg.chatwoot_api_token || "");
      const accountId = Number(cfg.chatwoot_account_id || 0);
      const rawInbox =
        req.body?.inbox_id !== undefined && req.body?.inbox_id !== null && String(req.body.inbox_id).trim() !== ""
          ? req.body.inbox_id
          : cfg.chatwoot_inbox_id;
      const inboxId = Number(rawInbox);

      const hasWaha = Boolean(wahaUrl && wahaApiKey);
      const hasChatwoot = Boolean(chatwootUrl && chatwootApiToken && accountId);

      if (!hasWaha && !hasChatwoot) {
        return reply.status(400).send({
          error:
            "Agente sem canal de envio: configure WAHA (waha_url + waha_api_key) ou Chatwoot (url, token, account_id).",
        });
      }

      if (!hasWaha) {
        if (!Number.isFinite(inboxId) || inboxId <= 0) {
          return reply.status(400).send({
            error:
              "Inbox ID do Chatwoot ausente ou invalido. Configure chatwoot_inbox_id no agente.",
          });
        }
      }

      const authorization = getBearerToken(req);
      const jobPayload: FinanceiroCampaignJobPayload = {
        userId: ctx.userId,
        authorization,
        agentId,
        contacts,
        messageTemplate,
        delayMinMs,
        delayMaxMs,
        inboxId: req.body?.inbox_id !== undefined && req.body?.inbox_id !== null ? Number(req.body.inbox_id) : undefined,
      };

      const queue = getFinanceiroCampaignQueue();
      if (queue) {
        const jobId = randomUUID();
        const ok = await addFinanceiroCampaignJob(jobId, jobPayload);
        if (ok) {
          return reply.status(202).send({ async: true, job_id: jobId });
        }
        console.warn("[Financeiro] Fila Redis indisponivel; usando execucao em memoria.");
      }

      const jobId = createMemoryFinanceiroJob({
        userId: ctx.userId,
        authorization,
        agentId,
        contacts,
        messageTemplate,
        delayMinMs,
        delayMaxMs,
        inboxId: jobPayload.inboxId,
      });

      return reply.status(202).send({ async: true, job_id: jobId });
    }
  );
}
