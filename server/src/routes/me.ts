import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  getBearerToken,
  normalizeRoleForExport,
  requireAuthenticated,
} from "../services/authorization.js";
import { isOwnerSuperadminEmail } from "../lib/owner-superadmin.js";

function poolErrorStatus(message: string): number {
  return /connection pool|timeout/i.test(message) ? 503 : 500;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out acquiring connection from connection pool.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Escopo do usuário autenticado — service role após validar JWT.
 */
export async function meRoutes(fastify: FastifyInstance) {
  fastify.get("/me/scope", async (req: FastifyRequest, reply: FastifyReply) => {
    const bearer = getBearerToken(req);
    if (!bearer) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const accessToken = bearer.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const supabase = createNexusClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const userId = userData.user.id;
    const email = userData.user.email ?? null;
    const ownerSuper = isOwnerSuperadminEmail(email);

    try {
      const [{ data: profile, error: profileErr }, { data: memberships, error: memErr }] =
        await withTimeout(
          Promise.all([
            supabase
              .from("profiles")
              .select("id, full_name, role, avatar_url, created_at, updated_at")
              .eq("id", userId)
              .maybeSingle(),
            supabase
              .from("tenant_memberships")
              .select("id, tenant_id, user_id, role, created_at, updated_at, tenants(name)")
              .eq("user_id", userId),
          ]),
          ownerSuper ? 2500 : 12_000
        );

      if (profileErr || memErr) {
        if (ownerSuper) {
          return reply.send({
            profile: { id: userId, full_name: null, role: "superadmin", avatar_url: null },
            memberships: [],
            isSuperAdmin: true,
            role: "superadmin",
            tenantIds: [],
            degraded: true,
          });
        }
        const msg = profileErr?.message || memErr?.message || "scope_query_failed";
        return reply.status(poolErrorStatus(msg)).send({ error: msg });
      }

      let role = normalizeRoleForExport(
        (profile as { role?: string } | null)?.role
          ?? (userData.user.app_metadata as { role?: string } | undefined)?.role
          ?? (userData.user.user_metadata as { role?: string } | undefined)?.role
      );
      if (ownerSuper) role = "superadmin";

      return reply.send({
        profile: profile
          ? { ...profile, role: ownerSuper ? "superadmin" : (profile as { role?: string }).role }
          : ownerSuper
            ? { id: userId, full_name: null, role: "superadmin", avatar_url: null }
            : null,
        memberships: memberships ?? [],
        isSuperAdmin: role === "superadmin",
        role,
        tenantIds: (memberships ?? []).map((m) => (m as { tenant_id: string }).tenant_id),
      });
    } catch (err) {
      if (ownerSuper) {
        return reply.send({
          profile: { id: userId, full_name: null, role: "superadmin", avatar_url: null },
          memberships: [],
          isSuperAdmin: true,
          role: "superadmin",
          tenantIds: [],
          degraded: true,
        });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(poolErrorStatus(msg)).send({ error: msg });
    }
  });

  /** Tenants acessíveis: todos (superadmin) ou só memberships. */
  fastify.get("/me/tenants", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const supabase = createNexusClient();

    if (auth.role === "superadmin") {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(supabase.from("tenants").select("*").order("created_at", { ascending: false })),
          8_000
        );
        if (error) {
          return reply.status(poolErrorStatus(error.message)).send({ error: error.message });
        }
        return reply.send({ data: data ?? [] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(poolErrorStatus(msg)).send({ error: msg });
      }
    }

    if (auth.tenantIds.length === 0) {
      return reply.send({ data: [] });
    }

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .in("id", auth.tenantIds)
      .order("created_at", { ascending: false });

    if (error) {
      return reply.status(poolErrorStatus(error.message)).send({ error: error.message });
    }

    return reply.send({ data: data ?? [] });
  });
}
