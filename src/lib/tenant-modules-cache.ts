type TenantModulesMap = Record<string, boolean>;

type ModulesCacheEntry = {
  userId: string;
  tenantId: string;
  modules: TenantModulesMap;
  usesCustomUserAcl: boolean;
  fetchedAt: number;
};

const STORAGE_KEY = "boomia-tenant-modules-v1";
const TTL_MS = 30 * 60 * 1000;

function readAll(): ModulesCacheEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ModulesCacheEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: ModulesCacheEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota */
  }
}

export function readTenantModulesCache(
  userId: string | undefined,
  tenantId: string | null | undefined
): Pick<ModulesCacheEntry, "modules" | "usesCustomUserAcl"> | null {
  if (!userId || !tenantId) return null;
  const entry = readAll().find((e) => e.userId === userId && e.tenantId === tenantId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return { modules: entry.modules, usesCustomUserAcl: entry.usesCustomUserAcl };
}

export function writeTenantModulesCache(
  userId: string,
  tenantId: string,
  modules: TenantModulesMap,
  usesCustomUserAcl: boolean
): void {
  const next = readAll().filter((e) => !(e.userId === userId && e.tenantId === tenantId));
  next.push({ userId, tenantId, modules, usesCustomUserAcl, fetchedAt: Date.now() });
  writeAll(next);
}

export function clearTenantModulesCacheForUser(userId: string): void {
  writeAll(readAll().filter((e) => e.userId !== userId));
}
