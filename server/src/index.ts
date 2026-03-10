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
import { contactsRoutes } from "./routes/contacts.js";
import { authRoutes } from "./routes/auth.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const SERVER_STARTED_AT = new Date().toISOString();
const SERVER_BUILD_ID = process.env.APP_BUILD_ID || process.env.GIT_COMMIT_SHA || "dev";

console.log("[Server] Starting... PORT=%s NODE_ENV=%s BUILD_ID=%s", PORT, process.env.NODE_ENV, SERVER_BUILD_ID);

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

  const extraOriginsRaw = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const extraOrigins = extraOriginsRaw.map((origin) => {
    // Suporte a wildcard no env, ex.: https://*.lovable.app
    if (origin.includes("*")) {
      const escaped = origin
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`);
    }
    return origin;
  });

  await fastify.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://localhost:8080",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:8080",
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/,
      /\.lovable\.dev$/,
      /\.lovable\.app$/,
      /\.lovableproject\.com$/,
      ...extraOrigins,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Deixa o plugin refletir automaticamente Access-Control-Request-Headers
    // para evitar bloqueio por novos headers do supabase-js/browser.
    allowedHeaders: undefined,
  });

  fastify.register(chatRoutes, { prefix: "/api" });
  fastify.register(chatLocalRoutes, { prefix: "/api" });
  fastify.register(deliveryRoutes, { prefix: "/api" });
  fastify.register(queueRoutes, { prefix: "/api" });
  fastify.register(webhookRoutes, { prefix: "/api" });
  fastify.register(toolsRoutes, { prefix: "/api" });
  fastify.register(adminRoutes, { prefix: "/api" });
  fastify.register(inventoryRoutes, { prefix: "/api" });
  fastify.register(contactsRoutes, { prefix: "/api" });
  fastify.register(authRoutes, { prefix: "/api" });

  fastify.get("/health", async () => ({ ok: true, timestamp: new Date().toISOString(), started_at: SERVER_STARTED_AT, build_id: SERVER_BUILD_ID }));
  fastify.get("/api/version", async () => ({ ok: true, started_at: SERVER_STARTED_AT, build_id: SERVER_BUILD_ID }));

  // Proxy Supabase (auth, rest) para evitar CORS: frontend chama /api/supabase-proxy/* -> NEXUS_DB_URL/*
  const nexusUrl = process.env.NEXUS_DB_URL;
  if (nexusUrl) {
    const base = nexusUrl.replace(/\/$/, "");
    fastify.all("/api/supabase-proxy/*", async (request, reply) => {
      const suffix = (request.url.split("?")[0].replace(/^\/api\/supabase-proxy\/?/, "") || "") + (request.url.includes("?") ? "?" + request.url.split("?")[1] : "");
      const targetUrl = `${base}/${suffix}`.replace(/([^:]\/)\/+/g, "$1");
      const nexusAnonKey = process.env.NEXUS_DB_ANON_KEY || process.env.NEXUS_SERVICE_ROLE_KEY || "";
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers)) {
        if (v && !["host", "connection", "content-length"].includes(k.toLowerCase())) headers[k] = Array.isArray(v) ? v[0] : v;
      }
      // Override apikey with the correct Nexus key
      // so the frontend can use any anon key (e.g. Lovable Cloud's) and the proxy fixes it
      if (nexusAnonKey) {
        const keySource = process.env.NEXUS_DB_ANON_KEY ? "NEXUS_DB_ANON_KEY" : "NEXUS_SERVICE_ROLE_KEY";
        console.log("[Supabase-Proxy] key override:", keySource, "prefix:", nexusAnonKey.slice(0, 20) + "...", "target:", targetUrl);
        headers["apikey"] = nexusAnonKey;
        headers["authorization"] = `Bearer ${nexusAnonKey}`;
      } else {
        console.warn("[Supabase-Proxy] NO nexus key found, forwarding original headers");
      }
      try {
        const body = ["POST", "PUT", "PATCH"].includes(request.method) && request.body ? JSON.stringify(request.body) : undefined;
        const res = await fetch(targetUrl, { method: request.method, headers, body });
        const text = await res.text();
        console.log("[Supabase-Proxy] response:", res.status, targetUrl.replace(/\?.*$/, ""));
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

  // Diagnostic endpoint — remove after debugging
  fastify.get("/api/debug/auth-test", async (_req, reply) => {
    const nexusUrl = process.env.NEXUS_DB_URL;
    const anonKey = process.env.NEXUS_DB_ANON_KEY;
    const serviceKey = process.env.NEXUS_SERVICE_ROLE_KEY;
    if (!nexusUrl) return reply.code(500).send({ error: "NEXUS_DB_URL not set" });

    const base = nexusUrl.replace(/\/$/, "");
    const tokenUrl = `${base}/auth/v1/token?grant_type=password`;
    const testEmail = "contato@agboom.com.br";
    const testPassword = "123456";

    const results: Record<string, unknown> = {
      nexusUrl: base,
      hasAnonKey: !!anonKey,
      hasServiceKey: !!serviceKey,
      anonKeyPrefix: anonKey?.slice(0, 30) + "...",
    };

    // Test with anon key
    if (anonKey) {
      try {
        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        const text = await res.text();
        results.anonKeyAuth = { status: res.status, body: text.slice(0, 300) };
      } catch (e) { results.anonKeyAuth = { error: String(e) }; }
    }

    // Test with service role key
    if (serviceKey) {
      try {
        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ email: testEmail, password: testPassword }),
        });
        const text = await res.text();
        results.serviceKeyAuth = { status: res.status, body: text.slice(0, 300) };
      } catch (e) { results.serviceKeyAuth = { error: String(e) }; }
    }

    return results;
  });

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

build()
  .then((app) => app.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);

    const FOLLOWUP_INTERVAL_MS = 60_000;
    const followupUrl = `http://127.0.0.1:${PORT}/api/queue/followups`;

    setInterval(async () => {
      try {
        const resp = await fetch(followupUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30_000) });
        if (resp.ok) {
          const data = await resp.json() as { processed?: number; skipped?: number };
          if ((data.processed ?? 0) > 0 || (data.skipped ?? 0) > 0) {
            console.log("[FollowUp-Cron] processed:", data.processed, "skipped:", data.skipped);
          }
        }
      } catch { /* silent — endpoint logs its own errors */ }
    }, FOLLOWUP_INTERVAL_MS);
    console.log(`[Server] Follow-up cron started (every ${FOLLOWUP_INTERVAL_MS / 1000}s)`);

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
