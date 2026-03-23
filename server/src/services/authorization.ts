import type { FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "./supabase.js";

export type AccessRole = "superadmin" | "tenant_admin" | "tenant_user";
type RawAccessRole = AccessRole | "admin";

export interface AccessContext {
  userId: string;
  role: AccessRole;
  tenantIds: string[];
  tenantAdminIds: string[];
}

function normalizeRole(role: RawAccessRole | string | null | undefined): AccessRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "superadmin" || normalized === "super_admin") return "superadmin";
  if (normalized === "admin") return "tenant_admin";
  if (normalized === "tenant_admin") return "tenant_admin";
  return "tenant_user";
}

function getBearerToken(req: FastifyRequest): string {
  const auth = (req.headers.authorization as string) || "";
  const alt = (req.headers["x-nexus-auth"] as string) || "";
  const token = auth || alt;
  if (!token) return "";
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export async function resolveAccessContext(req: FastifyRequest): Promise<AccessContext | null> {
  const bearer = getBearerToken(req);
  if (!bearer) return null;

  const supabase = createNexusClient(bearer);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const userId = userData.user.id;
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("tenant_memberships").select("tenant_id, role").eq("user_id", userId),
  ]);

  const role = normalizeRole(
    (profile as { role?: RawAccessRole | string } | null)?.role
    ?? (userData.user.app_metadata as { role?: string } | undefined)?.role
    ?? (userData.user.user_metadata as { role?: string } | undefined)?.role
  );
  const tenantIds = (memberships ?? []).map((m) => (m as { tenant_id: string }).tenant_id);
  const tenantAdminIds = (memberships ?? [])
    .filter((m) => (m as { role: AccessRole }).role === "tenant_admin")
    .map((m) => (m as { tenant_id: string }).tenant_id);

  return { userId, role, tenantIds, tenantAdminIds };
}

export async function requireAuthenticated(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<AccessContext | null> {
  const ctx = await resolveAccessContext(req);
  if (!ctx) {
    reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  return ctx;
}

export function canAccessTenant(ctx: AccessContext, tenantId: string | null | undefined): boolean {
  if (!tenantId) return ctx.role === "superadmin";
  if (ctx.role === "superadmin") return true;
  return ctx.tenantIds.includes(tenantId);
}

export function canManageTenant(ctx: AccessContext, tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  if (ctx.role === "superadmin") return true;
  return ctx.tenantAdminIds.includes(tenantId);
}

export async function requireSuperadmin(req: FastifyRequest, reply: FastifyReply): Promise<AccessContext | null> {
  const ctx = await requireAuthenticated(req, reply);
  if (!ctx) return null;
  if (ctx.role !== "superadmin") {
    reply.status(403).send({ error: "forbidden" });
    return null;
  }
  return ctx;
}
