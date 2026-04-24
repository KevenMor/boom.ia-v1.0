import { randomUUID } from "node:crypto";
import { createNexusClient } from "./supabase.js";
import {
  runFinanceiroCampaign,
  type FinanceiroCampaignContact,
  type FinanceiroCampaignProgress,
  type FinanceiroCampaignResult,
} from "./financeiro-campaign-runner.js";
import { persistFinanceiroCampaignRun } from "./financeiro-campaign-persist.js";

type JobStatus = "queued" | "running" | "completed" | "failed";

interface MemoryJob {
  userId: string;
  status: JobStatus;
  progress?: FinanceiroCampaignProgress;
  result?: FinanceiroCampaignResult;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, MemoryJob>();
const TTL_MS = 60 * 60 * 1000;

function pruneOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > TTL_MS) jobs.delete(id);
  }
}

export function createMemoryFinanceiroJob(params: {
  userId: string;
  authorization: string;
  agentId: string;
  contacts: FinanceiroCampaignContact[];
  messageTemplate: string;
  delayMinMs: number;
  delayMaxMs: number;
  inboxId?: number;
}): string {
  pruneOldJobs();
  const jobId = randomUUID();
  jobs.set(jobId, {
    userId: params.userId,
    status: "queued",
    createdAt: Date.now(),
  });

  setImmediate(() => {
    void (async () => {
      const row = jobs.get(jobId);
      if (!row) return;
      row.status = "running";
      const supabase = createNexusClient(params.authorization);
      let tenantId: string | null = null;
      try {
        const { data: agent, error: agentErr } = await supabase
          .from("agents")
          .select("id, tenant_id, config")
          .eq("id", params.agentId)
          .maybeSingle();

        if (agentErr || !agent) {
          row.status = "failed";
          row.error = "Agente nao encontrado.";
          return;
        }

        tenantId = agent.tenant_id as string;

        const result = await runFinanceiroCampaign({
          supabase,
          agentId: params.agentId,
          agentConfig: (agent.config || {}) as Record<string, unknown>,
          contacts: params.contacts,
          messageTemplate: params.messageTemplate,
          delayMinMs: params.delayMinMs,
          delayMaxMs: params.delayMaxMs,
          inboxOverride: params.inboxId,
          onProgress: async (p) => {
            const j = jobs.get(jobId);
            if (j) j.progress = p;
          },
        });
        await persistFinanceiroCampaignRun(supabase, {
          tenantId,
          agentId: params.agentId,
          createdByUserId: params.userId,
          jobId,
          messageTemplate: params.messageTemplate,
          status: "completed",
          result,
        });
        row.status = "completed";
        row.result = result;
      } catch (e) {
        row.status = "failed";
        row.error = e instanceof Error ? e.message : String(e);
        if (tenantId) {
          await persistFinanceiroCampaignRun(supabase, {
            tenantId,
            agentId: params.agentId,
            createdByUserId: params.userId,
            jobId,
            messageTemplate: params.messageTemplate,
            status: "failed",
            errorMessage: row.error,
          });
        }
      }
    })();
  });

  return jobId;
}

export function getMemoryFinanceiroJob(jobId: string, userId: string): MemoryJob | null {
  pruneOldJobs();
  const row = jobs.get(jobId);
  if (!row || row.userId !== userId) return null;
  return row;
}
