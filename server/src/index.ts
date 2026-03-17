import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { chatRoutes } from "./routes/chat.js";
import { chatLocalRoutes } from "./routes/chat-local.js";
import { deliveryRoutes } from "./routes/delivery.js";
import { queueRoutes } from "./routes/queue.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { toolsRoutes } from "./routes/tools.js";
import { adminRoutes } from "./routes/admin.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { ragRoutes } from "./routes/rag.js";
import { contactsRoutes } from "./routes/contacts.js";
import { demoRoutes } from "./routes/demo.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("[Server] Starting... PORT=%s NODE_ENV=%s", PORT, process.env.NODE_ENV);
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn("[Server] GOOGLE_MAPS_API_KEY não configurada — consultar_unidade usará distância em linha reta (Haversine). Veja docs/GOOGLE-MAPS-CONFIG.md");
}

async function build() {
  const isProduction = process.env.NODE_ENV === "production";
  const fastify = Fastify({
    logger: isProduction
      ? { level: "warn", serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) } }
      : true,
  });

  // Aceitar body vazio quando Content-Type for application/json (ex.: DELETE do Supabase, POST /queue/followups)
  fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    if (body === "" || body === undefined || (typeof body === "string" && body.trim() === "")) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  // Aceitar POST sem body (ex.: cron-job.org chamando /inventory/sync) — evita 415 Unsupported Media Type
  const emptyBody = (_req: unknown, _body: unknown, done: (err: Error | null, body?: object) => void) => done(null, {});
  fastify.addContentTypeParser("text/plain", { parseAs: "string" }, emptyBody);
  fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, emptyBody);

  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await fastify.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://localhost:8080",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8080",
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/,
      /\.lovable\.dev$/,
      ...extraOrigins,
    ],
    credentials: true,
    allowedHeaders: [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-nexus-auth",
      "x-supabase-client-platform",
      "x-supabase-client-platform-version",
      "x-supabase-client-runtime",
      "x-supabase-client-runtime-version",
    ],
  });

  fastify.register(chatRoutes, { prefix: "/api" });
  fastify.register(chatLocalRoutes, { prefix: "/api" });
  fastify.register(deliveryRoutes, { prefix: "/api" });
  fastify.register(queueRoutes, { prefix: "/api" });
  fastify.register(webhookRoutes, { prefix: "/api" });
  fastify.register(toolsRoutes, { prefix: "/api" });
  fastify.register(adminRoutes, { prefix: "/api" });
  fastify.register(inventoryRoutes, { prefix: "/api" });
  fastify.register(ragRoutes, { prefix: "/api" });
  fastify.register(contactsRoutes, { prefix: "/api" });
  fastify.register(demoRoutes, { prefix: "/api" });

  fastify.get("/health", async () => ({ ok: true, timestamp: new Date().toISOString() }));

  // Proxy Supabase (auth, rest) para evitar CORS: frontend chama /api/supabase-proxy/* -> NEXUS_DB_URL/*
  const nexusUrl = process.env.NEXUS_DB_URL;
  if (nexusUrl) {
    const base = nexusUrl.replace(/\/$/, "");
    fastify.all("/api/supabase-proxy/*", async (request, reply) => {
      const suffix = (request.url.split("?")[0].replace(/^\/api\/supabase-proxy\/?/, "") || "") + (request.url.includes("?") ? "?" + request.url.split("?")[1] : "");
      const targetUrl = `${base}/${suffix}`.replace(/([^:]\/)\/+/g, "$1");
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers)) {
        if (v && !["host", "connection", "content-length"].includes(k.toLowerCase())) headers[k] = Array.isArray(v) ? v[0] : v;
      }
      try {
        const body = ["POST", "PUT", "PATCH"].includes(request.method) && request.body ? JSON.stringify(request.body) : undefined;
        const res = await fetch(targetUrl, { method: request.method, headers, body });
        const text = await res.text();
        reply.code(res.status);
        res.headers.forEach((v, k) => { if (!["transfer-encoding"].includes(k.toLowerCase())) reply.header(k, v); });
        return reply.send(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.error({ err, targetUrl }, "Supabase proxy fetch failed");
        return reply.code(502).send({ error: "Supabase proxy error", message: msg });
      }
    });
  }

  fastify.get("/api/health/nexus", async (_req, reply) => {
    const url = process.env.NEXUS_DB_URL;
    const apikey = process.env.NEXUS_DB_ANON_KEY || process.env.NEXUS_SERVICE_ROLE_KEY;
    if (!url || !apikey) {
      return reply.code(503).send({
        ok: false,
        nexus: "unreachable",
        error: "NEXUS_DB_URL or NEXUS_DB_ANON_KEY not configured",
      });
    }
    const healthUrl = `${url.replace(/\/$/, "")}/rest/v1/`;
    const maskedUrl = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers: {
          apikey,
          Authorization: `Bearer ${apikey}`,
        },
      });
      if (res.ok || res.status === 401) {
        return { ok: true, nexus: "reachable", url: maskedUrl };
      }
      return reply.code(503).send({
        ok: false,
        nexus: "unreachable",
        error: `Supabase returned ${res.status}`,
        url: maskedUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(503).send({
        ok: false,
        nexus: "unreachable",
        error: msg,
        url: maskedUrl,
      });
    }
  });

  return fastify;
}

/** Exportado para testes (inject) sem abrir porta. */
export { build };

build()
  .then((app) => app.listen({ port: PORT, host: "0.0.0.0" }))
  .then(async () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);

    const { isRedisEnabled, addFollowUpJob } = await import("./services/followup-queue.js");
    const { startFollowUpWorker } = await import("./workers/followup-worker.js");

    if (isRedisEnabled()) {
      const worker = startFollowUpWorker();
      if (worker) {
        console.log("[Server] Follow-up BullMQ worker started");
        const { createNexusClient } = await import("./services/supabase.js");
        const supabase = createNexusClient();
        const { data: pending } = await supabase
          .from("follow_up_queue")
          .select("id, scheduled_at")
          .eq("status", "pending")
          .order("scheduled_at", { ascending: true })
          .limit(100);
        const now = Date.now();
        let rehydrated = 0;
        for (const item of pending ?? []) {
          const delayMs = Math.max(0, new Date(item.scheduled_at).getTime() - now);
          if (await addFollowUpJob(item.id, delayMs)) rehydrated++;
        }
        if (rehydrated > 0) {
          console.log(`[Server] Follow-up reidratação: ${rehydrated} job(s) adicionado(s)`);
        }
      }
    } else {
      const FOLLOWUP_INTERVAL_MS = 60_000;
      const followupUrl = `http://127.0.0.1:${PORT}/api/queue/followups`;
      setInterval(async () => {
        try {
          const resp = await fetch(followupUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(120_000) });
          if (resp.ok) {
            const data = await resp.json() as { processed?: number; skipped?: number; total?: number };
            const processed = data.processed ?? 0;
            const skipped = data.skipped ?? 0;
            const total = data.total ?? 0;
            if (processed > 0 || skipped > 0) {
              console.log("[FollowUp-Cron] processed:", processed, "skipped:", skipped);
            } else if (total > 0) {
              console.log("[FollowUp-Cron] tick: no items processed (pending may have been cancelled/skipped by rules)");
            } else {
              console.log("[FollowUp-Cron] tick: no pending items");
            }
          }
        } catch (e) {
          console.warn("[FollowUp-Cron] request failed:", (e as Error)?.message ?? e);
        }
      }, FOLLOWUP_INTERVAL_MS);
      console.log(`[Server] Follow-up cron started (every ${FOLLOWUP_INTERVAL_MS / 1000}s)`);
    }

    const REMINDER_INTERVAL_MS = 60_000;
    const reminderUrl = `http://127.0.0.1:${PORT}/api/queue/reminders`;
    setInterval(async () => {
      try {
        const resp = await fetch(reminderUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30_000) });
        if (resp.ok) {
          const data = await resp.json() as { processed?: number; skipped?: number; failed?: number };
          if ((data.processed ?? 0) > 0 || (data.skipped ?? 0) > 0 || (data.failed ?? 0) > 0) {
            console.log("[Reminder-Cron] processed:", data.processed, "skipped:", data.skipped, "failed:", data.failed);
          }
        }
      } catch { /* silent — endpoint logs its own errors */ }
    }, REMINDER_INTERVAL_MS);
    console.log(`[Server] Reminder cron started (every ${REMINDER_INTERVAL_MS / 1000}s)`);
  })
  .catch((err) => {
    console.error("[Server] Startup failed:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
