/**
 * Fila BullMQ para campanhas financeiras (envio com delays longos sem bloquear o HTTP).
 */
import { Queue } from "bullmq";
import type { FinanceiroCampaignContact } from "./financeiro-campaign-runner.js";

const QUEUE_NAME = "financeiro-campaign";

function parseRedisUrl(url: string): { host: string; port: number; username?: string; password?: string } | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return null;
  }
}

let _queue: Queue | null = null;

function getConnectionOptions() {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === "") return null;
  return parseRedisUrl(url);
}

export function getFinanceiroCampaignQueue(): Queue | null {
  const opts = getConnectionOptions();
  if (!opts) return null;
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: opts,
    defaultJobOptions: {
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
      attempts: 1,
    },
  });
  return _queue;
}

export interface FinanceiroCampaignJobPayload {
  userId: string;
  authorization: string;
  agentId: string;
  contacts: FinanceiroCampaignContact[];
  messageTemplate: string;
  delayMinMs: number;
  delayMaxMs: number;
  inboxId?: number;
}

export async function addFinanceiroCampaignJob(
  jobId: string,
  payload: FinanceiroCampaignJobPayload
): Promise<boolean> {
  const queue = getFinanceiroCampaignQueue();
  if (!queue) return false;
  try {
    await queue.add("run", payload, { jobId });
    return true;
  } catch (e) {
    console.warn("[FinanceiroCampaign] addFinanceiroCampaignJob failed:", (e as Error)?.message);
    return false;
  }
}

export function isRedisEnabledForFinanceiro(): boolean {
  return !!(process.env.REDIS_URL && process.env.REDIS_URL.trim() !== "");
}

export async function getFinanceiroCampaignBullJob(jobId: string) {
  const queue = getFinanceiroCampaignQueue();
  if (!queue) return null;
  return queue.getJob(jobId);
}

export { QUEUE_NAME as FINANCEIRO_CAMPAIGN_QUEUE_NAME };
