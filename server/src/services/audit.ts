import { createNexusClient } from "./supabase.js";
import type { AccessContext } from "./authorization.js";

export type AuditAction = "create" | "update" | "delete";
export type AuditResource =
  | "occurrence"
  | "inventory"
  | "contact"
  | "agent"
  | "user"
  | "tenant"
  | "user_acl";

interface AuditEntry {
  tenantId?: string | null;
  auth: Pick<AccessContext, "userId"> & { email?: string; name?: string };
  resource: AuditResource;
  resourceId?: string | null;
  resourceLabel?: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createNexusClient();

    let email = entry.auth.email ?? null;
    let name = entry.auth.name ?? null;

    // Busca email/nome: profiles para o nome, auth.admin para o email
    if (entry.auth.userId) {
      const [profileRes, userRes] = await Promise.allSettled([
        supabase.from("profiles").select("full_name").eq("id", entry.auth.userId).maybeSingle(),
        supabase.auth.admin.getUserById(entry.auth.userId),
      ]);

      if (profileRes.status === "fulfilled" && profileRes.value.data) {
        name = name ?? (profileRes.value.data as { full_name?: string | null }).full_name ?? null;
      }
      if (userRes.status === "fulfilled" && userRes.value.data?.user) {
        email = email ?? userRes.value.data.user.email ?? null;
        if (!name) {
          name = (userRes.value.data.user.user_metadata as { full_name?: string })?.full_name ?? null;
        }
      }
    }

    const { error } = await supabase.from("audit_logs").insert({
      tenant_id: entry.tenantId ?? null,
      user_id: entry.auth.userId,
      user_email: email,
      user_name: name,
      resource: entry.resource,
      resource_id: entry.resourceId ?? null,
      resource_label: entry.resourceLabel ?? null,
      action: entry.action,
      metadata: entry.metadata ?? null,
    });

    if (error) {
      console.error("[audit] insert error:", error.message, error.details);
    }
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}
