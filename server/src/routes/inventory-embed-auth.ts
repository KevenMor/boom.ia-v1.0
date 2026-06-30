import type { FastifyReply, FastifyRequest } from "fastify";
import {
  canAccessTenant,
  canManageTenant,
  requireAuthenticated,
} from "../services/authorization.js";

export function getEmbedInventoryTenantId(req: FastifyRequest): string | null {
  const expected = (process.env.CHATWOOT_MIRROR_EMBED_KEY || "").trim();
  if (!expected) return null;

  const headerKey = req.headers["x-nexus-embed-inventory"];
  if (typeof headerKey !== "string" || headerKey.trim() !== expected) return null;

  const tenantId = req.headers["x-embed-tenant-id"];
  if (typeof tenantId !== "string" || !tenantId.trim()) return null;
  return tenantId.trim();
}

type AuthCtx = NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>;

function canManageInventoryTenant(auth: AuthCtx, tenantId: string): boolean {
  if (auth.role === "superadmin") return true;
  return canManageTenant(auth, tenantId);
}

export async function authorizeInventory(
  req: FastifyRequest,
  reply: FastifyReply,
  tenant_id: string,
  mode: "read" | "manage",
): Promise<boolean> {
  const embedTenant = getEmbedInventoryTenantId(req);
  if (embedTenant) {
    if (embedTenant !== tenant_id) {
      reply.status(403).send({ error: "forbidden_tenant_access" });
      return false;
    }
    return true;
  }

  const auth = await requireAuthenticated(req, reply);
  if (!auth) return false;

  if (mode === "manage") {
    if (!canManageInventoryTenant(auth, tenant_id)) {
      reply.status(403).send({ error: "forbidden", detail: "manage_required" });
      return false;
    }
    return true;
  }

  if (!canAccessTenant(auth, tenant_id)) {
    reply.status(403).send({ error: "forbidden_tenant_access" });
    return false;
  }
  return true;
}

export async function authorizeInventoryList(
  req: FastifyRequest,
  reply: FastifyReply,
  tenant_id: string | undefined,
): Promise<{ tenantId?: string; embed: boolean } | null> {
  const embedTenant = getEmbedInventoryTenantId(req);
  if (embedTenant) {
    if (tenant_id && tenant_id !== embedTenant) {
      reply.status(403).send({ error: "forbidden_tenant_access" });
      return null;
    }
    return { tenantId: tenant_id ?? embedTenant, embed: true };
  }

  const auth = await requireAuthenticated(req, reply);
  if (!auth) return null;

  if (auth.role !== "superadmin" && !tenant_id) {
    reply.status(400).send({ error: "tenant_id is required" });
    return null;
  }

  if (tenant_id && !canAccessTenant(auth, tenant_id)) {
    reply.status(403).send({ error: "forbidden_tenant_access" });
    return null;
  }

  return { tenantId: tenant_id, embed: false };
}
