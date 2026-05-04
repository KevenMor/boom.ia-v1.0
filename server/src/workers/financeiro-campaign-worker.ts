/**
 * Worker BullMQ: processa campanhas financeiras com delays entre mensagens.
 */
import { Worker } from "bullmq";
import { createNexusClient } from "../services/supabase.js";
import { runFinanceiroCampaign } from "../services/financeiro-campaign-runner.js";
import { FINANCEIRO_CAMPAIGN_QUEUE_NAME } from "../services/financeiro-campaign-queue.js";
import type { FinanceiroCampaignJobPayload } from "../services/financeiro-campaign-queue.js";
import { persistFinanceiroCampaignRun } from "../services/financeiro-campaign-persist.js";

export function startFinanceiroCampaignWorker(): Worker | null {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === "") return null;

  const u = new URL(url);
  const connection = {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };

  const worker = new Worker(
    FINANCEIRO_CAMPAIGN_QUEUE_NAME,
    async (job) => {
      const data = job.data as FinanceiroCampaignJobPayload;
      const supabase = createNexusClient(data.authorization);

      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, tenant_id, config")
        .eq("id", data.agentId)
        .maybeSingle();

      if (agentErr || !agent) {
        throw new Error("Agente nao encontrado.");
      }

      const tenantId = agent.tenant_id as string;
      const jobIdStr = job.id != null ? String(job.id) : null;

      try {
        const result = await runFinanceiroCampaign({
          supabase,
          agentId: data.agentId,
          agentConfig: (agent.config || {}) as Record<string, unknown>,
          contacts: data.contacts,
          messageTemplate: data.messageTemplate,
          delayMinMs: data.delayMinMs,
          delayMaxMs: data.delayMaxMs,
          inboxOverride: data.inboxId,
          onProgress: async (p) => {
            await job.updateProgress(p);
          },
        });
        await persistFinanceiroCampaignRun(supabase, {
          tenantId,
          agentId: data.agentId,
          createdByUserId: data.userId,
          jobId: jobIdStr,
          messageTemplate: data.messageTemplate,
          status: "completed",
          result,
        });
        return result;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await persistFinanceiroCampaignRun(supabase, {
          tenantId,
          agentId: data.agentId,
          createdByUserId: data.userId,
          jobId: jobIdStr,
          messageTemplate: data.messageTemplate,
          status: "failed",
          errorMessage: errMsg,
        });
        throw e;
      }
    },
    {
      connection: connection as { host: string; port: number },
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log("[FinanceiroCampaign-Worker] Job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.warn("[FinanceiroCampaign-Worker] Job failed:", job?.id, err.message);
  });

  return worker;
}
