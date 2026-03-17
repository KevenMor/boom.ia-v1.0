/**
 * Worker BullMQ para processar follow-ups no horário exato.
 * Concurrency 1 para evitar overlap.
 */
import { Worker } from "bullmq";
import { createNexusClient } from "../services/supabase.js";
import { processFollowUpItem } from "../routes/queue.js";
import { addFollowUpJob } from "../services/followup-queue.js";

const QUEUE_NAME = "followup";

export function startFollowUpWorker(): Worker | null {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === "") return null;

  const u = new URL(url);
  const connection = {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 6379,
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
  const baseUrl = (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, "").replace(/\/api$/, "") || `http://localhost:${process.env.PORT || 3001}`;
  const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

  if (!nexusKey) {
    console.warn("[FollowUp-Worker] Missing NEXUS_SERVICE_ROLE_KEY, worker not started");
    return null;
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { itemId } = job.data as { itemId: string };
      const supabase = createNexusClient();

      const { data: item, error } = await supabase
        .from("follow_up_queue")
        .select("*")
        .eq("id", itemId)
        .single();

      if (error || !item) {
        console.warn("[FollowUp-Worker] Item not found:", itemId, error?.message);
        return;
      }

      if (item.status !== "pending") {
        console.log("[FollowUp-Worker] Item already processed/cancelled:", itemId, "status=" + item.status);
        return;
      }

      console.log(`[FollowUp-Worker] Processando item=${itemId?.slice(0, 8)}… conv=${item.conversation_id?.slice(0, 8)}… attempt=${item.attempt}/${item.max_attempts}`);

      const result = await processFollowUpItem(item, supabase, baseUrl, nexusKey);

      if (result.processed && result.nextId && result.nextDelay != null) {
        await addFollowUpJob(result.nextId, result.nextDelay * 60 * 1000);
      }
    },
    {
      connection: connection as { host: string; port: number },
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log("[FollowUp-Worker] Job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.warn("[FollowUp-Worker] Job failed:", job?.id, err.message);
  });

  return worker;
}
