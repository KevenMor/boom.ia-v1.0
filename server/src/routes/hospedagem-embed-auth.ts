import type { FastifyReply, FastifyRequest } from "fastify";
import type { createNexusClient } from "../services/supabase.js";
import {
  canAccessTenant,
  canManageTenant,
  requireAuthenticated,
} from "../services/authorization.js";

export function getEmbedHospedagemTenantId(req: FastifyRequest): string | null {
  const expected = (process.env.CHATWOOT_MIRROR_EMBED_KEY || "").trim();
  if (!expected) return null;

  const headerKey = req.headers["x-nexus-embed-hospedagem"];
  if (typeof headerKey !== "string" || headerKey.trim() !== expected) return null;

  const tenantId = req.headers["x-embed-tenant-id"];
  if (typeof tenantId !== "string" || !tenantId.trim()) return null;
  return tenantId.trim();
}

export async function authorizeHospedagem(
  req: FastifyRequest,
  reply: FastifyReply,
  supabase: ReturnType<typeof createNexusClient>,
  tenant_id: string,
  mode: "read" | "manage",
  denyIfDisabled: (
    supabase: ReturnType<typeof createNexusClient>,
    tenantId: string,
    reply: FastifyReply,
  ) => Promise<boolean>,
): Promise<boolean> {
  const embedTenant = getEmbedHospedagemTenantId(req);
  if (embedTenant) {
    if (embedTenant !== tenant_id) {
      reply.status(403).send({ error: "forbidden_tenant_access" });
      return false;
    }
    if (await denyIfDisabled(supabase, tenant_id, reply)) return false;
    return true;
  }

  const auth = await requireAuthenticated(req, reply);
  if (!auth) return false;

  const allowed = mode === "manage" ? canManageTenant(auth, tenant_id) : canAccessTenant(auth, tenant_id);
  if (!allowed) {
    reply.status(403).send({ error: "forbidden_tenant_access" });
    return false;
  }
  if (await denyIfDisabled(supabase, tenant_id, reply)) return false;
  return true;
}
