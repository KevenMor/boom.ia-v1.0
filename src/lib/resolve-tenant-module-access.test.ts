import { describe, expect, it } from "vitest";
import {
  pickSingleAclTenantId,
  resolveTenantModuleAccess,
} from "./resolve-tenant-module-access";

describe("resolveTenantModuleAccess", () => {
  it("herda tenant_modules quando não há ACL", () => {
    const { modules: map, usesCustomUserAcl } = resolveTenantModuleAccess(
      [
        { module_key: "dashboard", enabled: true },
        { module_key: "agents", enabled: false },
      ],
      []
    );
    expect(usesCustomUserAcl).toBe(false);
    expect(map.dashboard).toBe(true);
    expect(map.agents).toBe(false);
  });

  it("desabilita módulos do tenant que não estão na ACL customizada", () => {
    const { modules: map, usesCustomUserAcl } = resolveTenantModuleAccess(
      [
        { module_key: "dashboard", enabled: true },
        { module_key: "agents", enabled: true },
        { module_key: "conversations", enabled: true },
      ],
      [{ module_key: "agents", enabled: true }]
    );
    expect(usesCustomUserAcl).toBe(true);
    expect(map.agents).toBe(true);
    expect(map.dashboard).toBe(false);
    expect(map.conversations).toBe(false);
  });

  it("respeita enabled=false na ACL mesmo com tenant habilitado", () => {
    const { modules: map } = resolveTenantModuleAccess(
      [{ module_key: "dashboard", enabled: true }],
      [
        { module_key: "dashboard", enabled: false },
        { module_key: "agents", enabled: true },
      ]
    );
    expect(map.dashboard).toBe(false);
    expect(map.agents).toBe(true);
  });
});

describe("pickSingleAclTenantId", () => {
  it("retorna tenant quando ACL existe em um único tenant", () => {
    expect(
      pickSingleAclTenantId([
        { tenant_id: "tenant-a" },
        { tenant_id: "tenant-a" },
      ])
    ).toBe("tenant-a");
  });

  it("retorna null quando ACL está em múltiplos tenants", () => {
    expect(
      pickSingleAclTenantId([
        { tenant_id: "tenant-a" },
        { tenant_id: "tenant-b" },
      ])
    ).toBeNull();
  });
});
