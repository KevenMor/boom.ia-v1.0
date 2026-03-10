import type { FastifyInstance } from "fastify";
import { createClient } from "@supabase/supabase-js";

const nexusUrl = process.env.NEXUS_DB_URL!;
const anonKey = process.env.NEXUS_DB_ANON_KEY || process.env.NEXUS_SERVICE_ROLE_KEY!;

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/login — server-side login, bypasses browser CORS on supabase proxy
  fastify.post("/auth/login", async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    try {
      console.log("[Auth] attempting login for:", email, "nexusUrl:", nexusUrl?.slice(0, 40), "keyPrefix:", anonKey?.slice(0, 20));
      const supabase = createClient(nexusUrl, anonKey);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const errMsg = error.message || error.status || JSON.stringify(error);
        console.warn("[Auth] login failed for:", email, "error:", errMsg, "status:", error.status, "full:", JSON.stringify(error));
        return reply.code(401).send({ error: errMsg });
      }

      console.log("[Auth] login success for:", email);
      return reply.send({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in,
        expires_at: data.session?.expires_at,
        user: data.user,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Auth] login exception:", msg);
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/auth/refresh — refresh token server-side
  fastify.post("/auth/refresh", async (request, reply) => {
    const { refresh_token } = request.body as { refresh_token?: string };

    if (!refresh_token) {
      return reply.code(400).send({ error: "refresh_token is required" });
    }

    try {
      const supabase = createClient(nexusUrl, anonKey);
      const { data, error } = await supabase.auth.refreshSession({ refresh_token });

      if (error) {
        return reply.code(401).send({ error: error.message });
      }

      return reply.send({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in,
        expires_at: data.session?.expires_at,
        user: data.user,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: msg });
    }
  });
}
