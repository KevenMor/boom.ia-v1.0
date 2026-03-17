/**
 * BullMQ queue para follow-ups. Quando REDIS_URL está configurado,
 * jobs são agendados com delay exato; caso contrário, retorna null (fallback para cron).
 */
import { Queue } from "bullmq";

const QUEUE_NAME = "followup";

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

export function getFollowUpQueue(): Queue | null {
  const opts = getConnectionOptions();
  if (!opts) return null;
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: opts,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    },
  });
  return _queue;
}

/**
 * Adiciona job para processar follow-up no horário exato.
 * @param itemId ID do registro em follow_up_queue
 * @param delayMs Delay em milissegundos até executar
 * @returns true se job foi adicionado, false se Redis não está configurado
 */
export async function addFollowUpJob(itemId: string, delayMs: number): Promise<boolean> {
  const queue = getFollowUpQueue();
  if (!queue) return false;
  try {
    await queue.add("process", { itemId }, { jobId: itemId, delay: Math.max(0, delayMs) });
    return true;
  } catch (e) {
    console.warn("[FollowUp] addFollowUpJob failed:", (e as Error)?.message);
    return false;
  }
}

export function isRedisEnabled(): boolean {
  return !!(process.env.REDIS_URL && process.env.REDIS_URL.trim() !== "");
}
