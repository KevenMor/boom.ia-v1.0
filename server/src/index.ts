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

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("[Server] Starting... PORT=%s NODE_ENV=%s", PORT, process.env.NODE_ENV);

async function build() {
  const fastify = Fastify({ logger: true });

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
  fastify.register(contactsRoutes, { prefix: "/api" });

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

// #region agent log
async function startupDiagnostics() {
  const nexusUrl = process.env.NEXUS_DB_URL || "(not set)";
  const hasServiceKey = !!process.env.NEXUS_SERVICE_ROLE_KEY;
  const hasAnonKey = !!process.env.NEXUS_DB_ANON_KEY;
  const hasEncKey = !!process.env.ENCRYPTION_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const openaiLen = process.env.OPENAI_API_KEY?.length || 0;
  const geminiLen = process.env.GEMINI_API_KEY?.length || 0;
  const openaiPrefix = process.env.OPENAI_API_KEY?.slice(0, 8) || "(none)";

  console.log("[DBG-7948bd] ENV_CHECK:", JSON.stringify({
    NEXUS_DB_URL: nexusUrl,
    hasServiceKey, hasAnonKey, hasEncKey,
    hasOpenAI, openaiLen, openaiPrefix,
    hasGemini, geminiLen,
    CORS_ORIGINS: process.env.CORS_ORIGINS || "(not set)",
  }));

  // Test DNS resolution
  try {
    const { resolve4 } = await import("dns/promises");
    const host = nexusUrl.replace(/^https?:\/\//, "").replace(/[\/:].*/g, "");
    const ips = await resolve4(host);
    console.log("[DBG-7948bd] DNS_RESOLVE:", JSON.stringify({ host, ips }));
  } catch (e: any) {
    console.log("[DBG-7948bd] DNS_RESOLVE_FAIL:", JSON.stringify({ error: e?.message }));
  }

  // Test connectivity to Supabase
  try {
    const testUrl = `${nexusUrl.replace(/\/$/, "")}/rest/v1/`;
    const apikey = process.env.NEXUS_DB_ANON_KEY || process.env.NEXUS_SERVICE_ROLE_KEY || "";
    console.log("[DBG-7948bd] SUPABASE_CONN_TEST: fetching", testUrl);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(testUrl, {
      headers: { apikey, Authorization: `Bearer ${apikey}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    console.log("[DBG-7948bd] SUPABASE_CONN_OK:", JSON.stringify({ status: res.status, ok: res.ok }));
  } catch (e: any) {
    console.log("[DBG-7948bd] SUPABASE_CONN_FAIL:", JSON.stringify({ error: e?.message, code: e?.cause?.code }));
  }

  // Test OpenAI key validity (simple models endpoint)
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      });
      console.log("[DBG-7948bd] OPENAI_KEY_TEST:", JSON.stringify({ status: res.status }));
    } catch (e: any) {
      console.log("[DBG-7948bd] OPENAI_KEY_TEST_FAIL:", JSON.stringify({ error: e?.message }));
    }
  }

  // Test Gemini key
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, {
        signal: AbortSignal.timeout(10000),
      });
      console.log("[DBG-7948bd] GEMINI_KEY_TEST:", JSON.stringify({ status: res.status }));
    } catch (e: any) {
      console.log("[DBG-7948bd] GEMINI_KEY_TEST_FAIL:", JSON.stringify({ error: e?.message }));
    }
  }
}
// #endregion

build()
  .then((app) => app.listen({ port: PORT, host: "0.0.0.0" }))
  .then(() => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
    startupDiagnostics();
  })
  .catch((err) => {
    console.error("[Server] Startup failed:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
