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
import { promptReadRoutes } from "./routes/prompts-read.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { ragRoutes } from "./routes/rag.js";
import { contactsRoutes } from "./routes/contacts.js";
import { crmContactsRoutes } from "./routes/crm-contacts.js";
import { calendarServicesRoutes } from "./routes/calendar-services.js";
import { demoRoutes } from "./routes/demo.js";
import { occurrencesRoutes } from "./routes/occurrences.js";
import { suiteGalleriesRoutes } from "./routes/suite-galleries.js";
import { auditRoutes } from "./routes/audit.js";
import { tenantAiToggleRoutes } from "./routes/tenant-ai-toggle.js";
import { financeiroRoutes } from "./routes/financeiro.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log("[Server] Starting... PORT=%s NODE_ENV=%s", PORT, process.env.NODE_ENV);
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn("[Server] GOOGLE_MAPS_API_KEY não configurada — consultar_unidade usará distância em linha reta (Haversine). Veja docs/GOOGLE-MAPS-CONFIG.md");
}
{
  const srk = process.env.NEXUS_SERVICE_ROLE_KEY?.trim() ?? "";
  const looksPlaceholder = /COLE_|PLACEHOLDER|your-project/i.test(srk);
  if (!srk || srk.length < 80 || looksPlaceholder) {
    console.error(
      "[Server] NEXUS_SERVICE_ROLE_KEY em server/.env está em falta ou parece inválida. " +
        "Rotas /api/admin/* validam o teu login com o Supabase usando essa chave — sem ela correta, superadmin recebe 401 e a lista de tenants no painel fica vazia. " +
        "Copia a service_role do mesmo projeto que NEXUS_DB_URL (Easypanel → Supabase → Settings → API)."
    );
  }
}

async function build() {
  const isProduction = process.env.NODE_ENV === "production";
  const fastify = Fastify({
    // Storage bucket suite-galleries (Galeria): até 20 MB fotos / 200 MB vídeos no proxy Supabase
    bodyLimit: 220 * 1024 * 1024,
    logger: isProduction
      ? { level: "warn", serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) } }
      : { level: "info", transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } },
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

  // Aceitar upload de vídeo/binário (Supabase Storage via proxy) — evita 415 Unsupported Media Type
  const rawBufferParser = (_req: unknown, payload: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, payload);
  fastify.addContentTypeParser(/^video\//i, { parseAs: "buffer" }, rawBufferParser);
  fastify.addContentTypeParser(/^application\/octet-stream/i, { parseAs: "buffer" }, rawBufferParser);
  fastify.addContentTypeParser(/^multipart\/form-data/i, { parseAs: "buffer" }, rawBufferParser);
  fastify.addContentTypeParser(/^image\//i, { parseAs: "buffer" }, rawBufferParser);
  // Catch-all: tipos não reconhecidos (ex.: Content-Type vazio ou incomum) — evita 415
  fastify.addContentTypeParser("*", { parseAs: "buffer" }, rawBufferParser);

  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const tenantToggleCorsOrigins = (process.env.TENANT_AI_TOGGLE_CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const tenantToggleCorsReflect =
    process.env.TENANT_AI_TOGGLE_CORS_REFLECT === "1" || process.env.TENANT_AI_TOGGLE_CORS_REFLECT === "true";

  const corsStaticAllowList: (string | RegExp)[] = [
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/,
    /\.lovable\.dev$/,
    ...extraOrigins,
  ];

  function isTenantToggleCorsOrigin(origin: string): boolean {
    for (const o of tenantToggleCorsOrigins) {
      if (o === origin) return true;
      if (o.startsWith("*.")) {
        const d = o.slice(2);
        try {
          const host = new URL(origin).hostname;
          if (host === d || host.endsWith("." + d)) return true;
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  }

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      for (const item of corsStaticAllowList) {
        if (typeof item === "string" && item === origin) {
          cb(null, true);
          return;
        }
        if (item instanceof RegExp && item.test(origin)) {
          cb(null, true);
          return;
        }
      }
      if (isTenantToggleCorsOrigin(origin)) {
        cb(null, true);
        return;
      }
      if (tenantToggleCorsReflect) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    allowedHeaders: [
      "accept",
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-nexus-auth",
      "x-tenant-ai-toggle-secret",
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
  fastify.register(promptReadRoutes, { prefix: "/api" });
  fastify.register(adminRoutes, { prefix: "/api" });
  fastify.register(inventoryRoutes, { prefix: "/api" });
  fastify.register(ragRoutes, { prefix: "/api" });
  fastify.register(contactsRoutes, { prefix: "/api" });
  fastify.register(crmContactsRoutes, { prefix: "/api" });
  fastify.register(calendarServicesRoutes, { prefix: "/api" });
  fastify.register(occurrencesRoutes, { prefix: "/api" });
  fastify.register(financeiroRoutes, { prefix: "/api" });
  fastify.register(suiteGalleriesRoutes, { prefix: "/api" });
  fastify.register(auditRoutes, { prefix: "/api" });
  fastify.register(tenantAiToggleRoutes, { prefix: "/api" });
  fastify.register(demoRoutes, { prefix: "/api" });

  fastify.get("/health", async () => ({ ok: true, timestamp: new Date().toISOString() }));

  type ReqLog = { warn: (obj: Record<string, unknown>, msg: string) => void };

  /** Corpo a repassar ao Supabase: uploads de Storage têm de ir como bytes, nunca JSON.stringify(Buffer). */
  function buildSupabaseProxyForwardBody(
    log: ReqLog,
    method: string,
    suffix: string,
    raw: unknown,
    contentType: string | undefined
  ): string | Uint8Array | undefined {
    if (!["POST", "PUT", "PATCH"].includes(method) || raw === undefined) return undefined;
    if (Buffer.isBuffer(raw)) return new Uint8Array(raw);
    if (raw instanceof Uint8Array) return raw;
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if (typeof raw === "string") return raw;
    const storageObjectWrite = /\/storage\/v1\/object\//.test(suffix);
    if (storageObjectWrite) {
      // Se não é Buffer, o parser pode ter errado — JSON quebra upload e o Storage costuma responder 4xx
      log.warn(
        { method, contentType, bodyType: typeof raw },
        "supabase-proxy: storage write com body não-binário; verifique Content-Type no cliente"
      );
      return undefined;
    }
    return JSON.stringify(raw);
  }

  // Proxy Supabase (auth, rest) para evitar CORS: frontend chama /api/supabase-proxy/* -> NEXUS_DB_URL/*
  // Sempre registra a rota: sem NEXUS_DB_URL devolve JSON (evita corpo vazio → "Unexpected end of JSON input" no cliente).
  fastify.all("/api/supabase-proxy/*", async (request, reply) => {
    const nexusUrl = process.env.NEXUS_DB_URL?.trim();
    if (!nexusUrl) {
      return reply.code(503).send({
        error: "configuration_error",
        error_description:
          "NEXUS_DB_URL não está definido no servidor (ex.: server/.env). O login do painel depende deste proxy — veja docker/LOGIN-CORS-SUPABASE.md",
      });
    }

    const base = nexusUrl.replace(/\/$/, "");
    const suffix =
      (request.url.split("?")[0].replace(/^\/api\/supabase-proxy\/?/, "") || "") +
      (request.url.includes("?") ? "?" + request.url.split("?")[1] : "");
    const targetUrl = `${base}/${suffix}`.replace(/([^:]\/)\/+/g, "$1");
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(request.headers)) {
      if (v && !["host", "connection", "content-length"].includes(k.toLowerCase())) headers[k] = Array.isArray(v) ? v[0] : v;
    }

    // Storage: sempre substituir apikey pelo real — o browser pode enviar o demo key (fallback do nexus-client)
    // que o Supabase real rejeita. Para writes (POST/PUT) preserva o Bearer JWT do usuário; para reads força anon.
    const nexusAnon = process.env.NEXUS_DB_ANON_KEY?.trim();
    if (nexusAnon && /\/storage\/v1\//.test(suffix)) {
      headers.apikey = nexusAnon;
      const lower = new Set(Object.keys(headers).map((k) => k.toLowerCase()));
      if (!lower.has("authorization")) headers.Authorization = `Bearer ${nexusAnon}`;
    }

    try {
      const body =
        ["POST", "PUT", "PATCH"].includes(request.method) && request.body !== undefined
          ? buildSupabaseProxyForwardBody(
              request.log,
              request.method,
              suffix,
              request.body,
              typeof request.headers["content-type"] === "string" ? request.headers["content-type"] : undefined
            )
          : undefined;

      // Uploads de Storage exigem content-length correto — o fetch do Node não o calcula automaticamente para Uint8Array.
      if (body instanceof Uint8Array) headers["content-length"] = String(body.byteLength);
      const res = await fetch(targetUrl, { method: request.method, headers, body: body as RequestInit["body"] });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const storageObjectPath = /\/storage\/v1\/object\//.test(suffix);
      const binaryByMime =
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("font/") ||
        contentType === "application/octet-stream" ||
        contentType.startsWith("application/pdf");
      // Só GET/HEAD em object público devolvem ficheiro binário. POST/PUT de upload respondem JSON — não usar arrayBuffer aí.
      const storageObjectRead =
        storageObjectPath &&
        res.ok &&
        (request.method === "GET" || request.method === "HEAD");
      // Imagens/vídeos públicos do Storage: NUNCA usar res.text() no binário — UTF-8 corrompe bytes e o <img> fica partido.
      const passThroughBinary = binaryByMime || storageObjectRead;

      reply.code(res.status);
      res.headers.forEach((v, k) => {
        const low = k.toLowerCase();
        if (low === "transfer-encoding") return;
        if (passThroughBinary && (low === "content-length" || low === "content-encoding")) return;
        reply.header(k, v);
      });

      if (passThroughBinary) {
        const buf = Buffer.from(await res.arrayBuffer());
        return reply.send(buf);
      }

      let text = await res.text();
      if (!res.ok && storageObjectPath && (request.method === "GET" || request.method === "HEAD")) {
        request.log.warn(
          { status: res.status, suffix: suffix.slice(0, 220), contentType },
          "supabase-proxy: Storage GET/HEAD falhou — confira bucket suite-galleries, path e se NEXUS_DB_URL é o mesmo projeto onde rodou o SQL"
        );
      }
      // Supabase auth client espera JSON; corpo vazio ou HTML causa "Unexpected end of JSON input"
      const isAuthPath = /\/auth\/v1\//.test(suffix);
      const isEmpty = !text || !text.trim();
      const looksLikeHtml = text.trim().toLowerCase().startsWith("<!");
      if (isAuthPath && (isEmpty || looksLikeHtml)) {
        reply.header("content-type", "application/json");
        text = JSON.stringify({
          error: isEmpty ? "empty_response" : "invalid_response",
          error_description: isEmpty
            ? (res.ok ? "Resposta vazia do Supabase" : `Supabase retornou ${res.status} sem corpo`)
            : `Supabase retornou HTML em vez de JSON (status ${res.status}). Verifique se o Supabase está acessível.`,
        });
      } else if (isAuthPath && !isEmpty && !looksLikeHtml) {
        try {
          JSON.parse(text);
        } catch {
          reply.header("content-type", "application/json");
          text = JSON.stringify({
            error: "invalid_json",
            error_description: `Resposta do Supabase não é JSON válido (status ${res.status}).`,
          });
        }
      }
      return reply.send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.error({ err, targetUrl }, "Supabase proxy fetch failed");
      return reply.code(502).send({
        error: "proxy_fetch_failed",
        error_description: `Falha ao contactar o Supabase: ${msg}`,
      });
    }
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

  // GET /api/storage-health — verifica se os buckets de Storage necessários existem.
  // Útil para diagnosticar "404 nas fotos da galeria em produção".
  fastify.get("/api/storage-health", async (_req, reply) => {
    const nexusUrl = process.env.NEXUS_DB_URL?.trim();
    if (!nexusUrl) {
      return reply.code(503).send({ ok: false, error: "NEXUS_DB_URL not set" });
    }
    const serviceKey = process.env.NEXUS_SERVICE_ROLE_KEY?.trim() || process.env.NEXUS_DB_ANON_KEY?.trim();
    if (!serviceKey) {
      return reply.code(503).send({ ok: false, error: "No storage key configured" });
    }
    try {
      const url = `${nexusUrl.replace(/\/$/, "")}/storage/v1/bucket`;
      const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      if (!res.ok) {
        return reply.code(502).send({ ok: false, storage_status: res.status, hint: "Storage API inacessível — confirme que o Supabase Storage está rodando." });
      }
      const buckets = await res.json() as Array<{ id?: string; name?: string; public?: boolean }>;
      const names = buckets.map((b) => b.id ?? b.name ?? "?");
      const hasSuiteGalleries = names.some((n) => n === "suite-galleries");
      return {
        ok: true,
        buckets: names,
        suite_galleries_bucket: hasSuiteGalleries ? "exists" : "MISSING — run sql/017_storage_suite_galleries_bucket.sql in Supabase",
        nexus_host: nexusUrl.replace(/^https?:\/\//, "").split("/")[0],
      };
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error)?.message ?? String(err) });
    }
  });

  return fastify;
}

/** Exportado para testes (inject) sem abrir porta. */
export { build };

/** Garante que os buckets de Storage necessários existem no Supabase (criados se ausentes). */
async function ensureStorageBuckets(): Promise<void> {
  try {
    const { createNexusClient } = await import("./services/supabase.js");
    const sb = createNexusClient();
    const BUCKETS: Array<{ id: string; public: boolean; fileSizeLimit: number }> = [
      { id: "suite-galleries", public: true, fileSizeLimit: 209_715_200 }, // 200 MB
    ];
    for (const b of BUCKETS) {
      const { data: existing, error: getErr } = await sb.storage.getBucket(b.id);
      if (existing) {
        console.log(`[Storage] Bucket '${b.id}' OK.`);
        continue;
      }
      if (getErr && !getErr.message?.toLowerCase().includes("not found") && !getErr.message?.toLowerCase().includes("does not exist")) {
        console.warn(`[Storage] Não foi possível verificar bucket '${b.id}':`, getErr.message);
        continue;
      }
      const { error: createErr } = await sb.storage.createBucket(b.id, { public: b.public, fileSizeLimit: b.fileSizeLimit });
      if (createErr && !createErr.message?.toLowerCase().includes("already exists") && !createErr.message?.toLowerCase().includes("duplicate")) {
        console.error(`[Storage] Falha ao criar bucket '${b.id}':`, createErr.message);
      } else {
        console.log(`[Storage] Bucket '${b.id}' criado (público, limite ${b.fileSizeLimit / 1024 / 1024} MB).`);
      }
    }
  } catch (err) {
    console.warn("[Storage] ensureStorageBuckets falhou (não crítico):", (err as Error)?.message ?? err);
  }
}

build()
  .then((app) => app.listen({ port: PORT, host: "0.0.0.0" }))
  .then(async () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
    void ensureStorageBuckets();

    const { isRedisEnabled, addFollowUpJob } = await import("./services/followup-queue.js");
    const { startFollowUpWorker } = await import("./workers/followup-worker.js");

    if (isRedisEnabled()) {
      const { startFinanceiroCampaignWorker } = await import("./workers/financeiro-campaign-worker.js");
      const financeiroWorker = startFinanceiroCampaignWorker();
      if (financeiroWorker) {
        console.log("[Server] Financeiro campaign BullMQ worker started");
      }

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
