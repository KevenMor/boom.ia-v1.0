import type { ModuleKey } from "./tenant-modules";
import { TENANT_MODULES } from "./tenant-modules";

export type TenantModuleRow = { module_key: string; enabled: boolean };
export type UserModuleAclRow = { module_key: string; enabled: boolean; tenant_id?: string };

export interface ResolvedTenantModuleAccess {
  modules: Record<string, boolean>;
  usesCustomUserAcl: boolean;
}

/**
 * Combina módulos do tenant com ACL do usuário.
 * Sem ACL customizada: herda tenant_modules (chave ausente = habilitado).
 * Com ACL: allowlist explícita — módulos fora da ACL ficam desabilitados.
 */
export function resolveTenantModuleAccess(
  tenantModules: TenantModuleRow[],
  userAcl: UserModuleAclRow[] | null | undefined
): ResolvedTenantModuleAccess {
  const tenantMap: Record<string, boolean> = {};
  for (const row of tenantModules) {
    const key = String(row.module_key ?? "").trim();
    if (!key) continue;
    tenantMap[key] = row.enabled !== false;
  }

  const acl = userAcl ?? [];
  if (acl.length === 0) {
    return { modules: tenantMap, usesCustomUserAcl: false };
  }

  const aclMap: Record<string, boolean> = {};
  for (const row of acl) {
    const key = String(row.module_key ?? "").trim();
    if (!key) continue;
    aclMap[key] = row.enabled !== false;
  }

  const merged: Record<string, boolean> = {};
  for (const mod of TENANT_MODULES) {
    merged[mod.key] = mod.key in aclMap ? aclMap[mod.key]! : false;
  }
  for (const [key, enabled] of Object.entries(aclMap)) {
    if (!(key in merged)) merged[key] = enabled;
  }

  return { modules: merged, usesCustomUserAcl: true };
}

/** Se o usuário tem ACL em exatamente um tenant, retorna esse tenant. */
export function pickSingleAclTenantId(
  aclRows: Array<{ tenant_id?: string | null }> | null | undefined
): string | null {
  const ids = [
    ...new Set(
      (aclRows ?? [])
        .map((row) => String(row.tenant_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  return ids.length === 1 ? ids[0]! : null;
}
