import { describe, expect, it, beforeEach } from "vitest";
import {
  clearTenantModulesCacheForUser,
  readTenantModulesCache,
  writeTenantModulesCache,
} from "./tenant-modules-cache";

describe("tenant-modules-cache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persiste e lê módulos por usuário e tenant", () => {
    writeTenantModulesCache("user-1", "tenant-a", { agents: true, dashboard: true }, false);
    const hit = readTenantModulesCache("user-1", "tenant-a");
    expect(hit?.modules.agents).toBe(true);
    expect(hit?.usesCustomUserAcl).toBe(false);
    expect(readTenantModulesCache("user-1", "tenant-b")).toBeNull();
  });

  it("clearTenantModulesCacheForUser remove entradas do usuário", () => {
    writeTenantModulesCache("user-1", "tenant-a", { agents: true }, false);
    writeTenantModulesCache("user-2", "tenant-a", { agents: false }, true);
    clearTenantModulesCacheForUser("user-1");
    expect(readTenantModulesCache("user-1", "tenant-a")).toBeNull();
    expect(readTenantModulesCache("user-2", "tenant-a")?.modules.agents).toBe(false);
  });
});
