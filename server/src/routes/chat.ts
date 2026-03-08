import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Agent, fetch as undiciFetch } from "undici";

const USE_CHAT_LOCAL = process.env.USE_CHAT_LOCAL !== "false";
const INTERNAL_API_INSECURE_TLS = process.env.INTERNAL_API_INSECURE_TLS === "true";
const USE_CHAT_LOCAL_INJECT = process.env.USE_CHAT_LOCAL_INJECT !== "false";
const EDGE_CHAT_URL =
  process.env.EDGE_CHAT_URL ||
  (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/functions/v1/chat-agent` : null);
const EDGE_CHAT_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/chat", async (req: FastifyRequest, reply: FastifyReply) => {
    console.log("[Chat] USE_CHAT_LOCAL:", USE_CHAT_LOCAL, "USE_CHAT_LOCAL_INJECT:", USE_CHAT_LOCAL_INJECT);
    
    if (USE_CHAT_LOCAL) {
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";

      if (USE_CHAT_LOCAL_INJECT) {
        console.log("[Chat] Usando fastify.inject() para /api/chat-local");
        try {
          const res = await fastify.inject({
            method: "POST",
            url: "/api/chat-local",
            headers: {
              "Content-Type": "application/json",
              "x-nexus-auth": nexusAuth ? (nexusAuth.startsWith("Bearer ") ? nexusAuth : `Bearer ${nexusAuth}`) : "",
            },
            payload: req.body as Record<string, unknown>,
          }) as { statusCode: number; headers: Record<string, string>; payload: Buffer | string };
          if (res.statusCode >= 400) {
            return reply.status(res.statusCode).send(res.payload);
          }
          const contentType = res.headers["content-type"] || "";
          if (contentType.includes("text/event-stream")) {
            const origin = (req.headers.origin as string) || "";
            const extraOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
            const allowedOrigins = [
              "http://localhost:5173",
              "http://localhost:8080",
              "http://127.0.0.1:5173",
              "http://127.0.0.1:8080",
              ...extraOrigins,
            ];
            const isLocalNetwork = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
            const isAllowed = allowedOrigins.includes(origin) || isLocalNetwork || /\.lovable\.dev$/.test(origin);
            const allowOrigin = isAllowed ? origin : "http://localhost:8080";
            reply.raw.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": allowOrigin,
              "Access-Control-Allow-Credentials": "true",
            });
            reply.raw.write(res.payload);
            reply.raw.end();
            return;
          }
          return reply.send(res.payload);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[Chat] Inject error (caindo no fallback fetch):", e);
          return reply.status(502).send({ error: msg || "Chat proxy failed" });
        }
      } else {
        console.log("[Chat] USE_CHAT_LOCAL_INJECT é false, usando fetch com rede");
      }

      const port = process.env.PORT || "3001";
      const internalBase = process.env.INTERNAL_API_BASE || `http://127.0.0.1:${port}`;
      const chatLocalUrl = `${internalBase.replace(/\/+$/, "").replace(/\/api$/, "")}/api/chat-local`;
      
      console.log("[Chat] Usando fetch para:", chatLocalUrl, "INTERNAL_API_INSECURE_TLS:", INTERNAL_API_INSECURE_TLS);

      try {
        const fetchOpts = {
          method: "POST" as const,
          headers: {
            "Content-Type": "application/json",
            "x-nexus-auth": nexusAuth ? (nexusAuth.startsWith("Bearer ") ? nexusAuth : `Bearer ${nexusAuth}`) : "",
          },
          body: JSON.stringify(req.body),
          ...(chatLocalUrl.startsWith("https://") && INTERNAL_API_INSECURE_TLS
            ? { dispatcher: new Agent({ connect: { rejectUnauthorized: false } }) }
            : {}),
        };
        const upstream = await undiciFetch(chatLocalUrl, fetchOpts);

        if (!upstream.ok) {
          const errText = await upstream.text();
          console.error("[Chat] Upstream error:", upstream.status, errText.slice(0, 400));
          return reply.status(upstream.status).send(errText);
        }

        const contentType = upstream.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
          const origin = (req.headers.origin as string) || "";
          const extraOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
          const allowedOrigins = [
            "http://localhost:5173",
            "http://localhost:8080",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8080",
            ...extraOrigins,
          ];
          const isLocalNetwork = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
          const isAllowed = allowedOrigins.includes(origin) || isLocalNetwork || /\.lovable\.dev$/.test(origin);
          const allowOrigin = isAllowed ? origin : "http://localhost:8080";
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": allowOrigin,
            "Access-Control-Allow-Credentials": "true",
          });
          const reader = upstream.body!.getReader();
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reply.raw.write(value);
            }
            reply.raw.end();
          };
          pump().catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            const isClientDisconnect = /ECONNRESET|socket hang up|EPIPE/i.test(msg);
            if (isClientDisconnect) {
              console.warn("[Chat] Stream: cliente desconectou:", msg);
            } else {
              console.error("[Chat] Stream error:", e);
            }
            reply.raw.end();
          });
          return;
        }

        const data = await upstream.json();
        return reply.send(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Chat] Proxy error:", e);
        return reply.status(502).send({ error: msg || "Chat proxy failed" });
      }
    }

    if (!EDGE_CHAT_URL || !EDGE_CHAT_KEY) {
      console.error("[Chat] Not configured: EDGE_CHAT_URL or EDGE_CHAT_KEY missing.");
      return reply.status(501).send({
        error: "Chat not configured. Set USE_CHAT_LOCAL=true (default) or configure EDGE_CHAT_URL.",
      });
    }

    const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
    try {
      const upstream = await fetch(EDGE_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EDGE_CHAT_KEY}`,
          "x-nexus-auth": nexusAuth ? (nexusAuth.startsWith("Bearer ") ? nexusAuth : `Bearer ${nexusAuth}`) : "",
        },
        body: JSON.stringify(req.body),
      });

      if (!upstream.ok) {
        const errText = await upstream.text();
        console.error("[Chat] Edge error:", upstream.status, errText.slice(0, 400));
        return reply.status(upstream.status).send(errText);
      }

      const contentType = upstream.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const origin = (req.headers.origin as string) || "";
        const extraOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
        const allowedOrigins = [
          "http://localhost:5173",
          "http://localhost:8080",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:8080",
          ...extraOrigins,
        ];
        const isLocalNetwork = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);
        const isAllowed = allowedOrigins.includes(origin) || isLocalNetwork || /\.lovable\.dev$/.test(origin);
        const allowOrigin = isAllowed ? origin : "http://localhost:8080";
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": allowOrigin,
          "Access-Control-Allow-Credentials": "true",
        });
        const reader = upstream.body!.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
          reply.raw.end();
        };
        pump().catch((e: any) => {
          const isClientDisconnect = e?.code === "ECONNRESET" || /ECONNRESET|socket hang up|EPIPE/i.test(String(e?.message || ""));
          if (isClientDisconnect) {
            console.warn("[Chat] Edge stream: cliente desconectou antes de receber resposta completa:", e?.message || e);
          } else {
            console.error("[Chat] Stream error:", e);
          }
          reply.raw.end();
        });
        return;
      }

      const data = await upstream.json();
      return reply.send(data);
    } catch (e: any) {
      console.error("[Chat] Edge proxy error:", e);
      return reply.status(502).send({ error: e.message || "Chat proxy failed" });
    }
  });
}
