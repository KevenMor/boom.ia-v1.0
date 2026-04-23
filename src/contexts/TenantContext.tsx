import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { Tenant } from "@/types/database";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { relationName } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type TenantModulesMap = Record<string, boolean>;

interface TenantContextValue {
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  /** Helper: the full tenant object (set by the selector) */
  selectedTenant: Tenant | null;
  setSelectedTenant: (t: Tenant | null) => void;
  selectedTenantModules: TenantModulesMap | null;
  tenantModulesLoading: boolean;
  isModuleEnabled: (moduleKey: string) => boolean;
  /** Nome do tenant selecionado (membership + objeto do switcher); não depende só de useTenants. */
  scopedTenantDisplayName: string | undefined;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { canAccessTenant, isSuperAdmin, memberships, loading: authLoading } = useAuth();
  const [selectedTenantId, setSelectedTenantIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("boomia-selected-tenant") || null;
    } catch {
      return null;
    }
  });
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedTenantModules, setSelectedTenantModules] = useState<TenantModulesMap | null>(null);
  const [tenantModulesLoading, setTenantModulesLoading] = useState(false);

  const setSelectedTenantId = useCallback(
    (id: string | null) => {
      if (!isSuperAdmin) {
        if (id === null) {
          return;
        }
        if (!canAccessTenant(id)) {
          return;
        }
      }
      setSelectedTenantIdRaw(id);
      try {
        if (id) localStorage.setItem("boomia-selected-tenant", id);
        else localStorage.removeItem("boomia-selected-tenant");
      } catch {
        return;
      }
    },
    [canAccessTenant, isSuperAdmin]
  );

  const membershipTenantIds = useMemo(
    () => memberships.map((m) => m.tenant_id).filter(Boolean),
    [memberships]
  );

  useLayoutEffect(() => {
    if (authLoading || isSuperAdmin) return;
    if (membershipTenantIds.length === 0) return;
    const allowed = new Set(membershipTenantIds);
    const next =
      selectedTenantId && allowed.has(selectedTenantId)
        ? selectedTenantId
        : membershipTenantIds[0];
    if (next !== selectedTenantId) {
      setSelectedTenantIdRaw(next);
      try {
        localStorage.setItem("boomia-selected-tenant", next);
      } catch {
        /* ignore */
      }
    }
  }, [authLoading, isSuperAdmin, membershipTenantIds, selectedTenantId]);

  useEffect(() => {
    if (authLoading) return;
    if (selectedTenantId && !isSuperAdmin && !canAccessTenant(selectedTenantId)) {
      const fallback = membershipTenantIds[0] ?? null;
      setSelectedTenantIdRaw(fallback);
      setSelectedTenant(null);
      try {
        if (fallback) localStorage.setItem("boomia-selected-tenant", fallback);
        else localStorage.removeItem("boomia-selected-tenant");
      } catch {
        /* ignore */
      }
    }
  }, [authLoading, selectedTenantId, isSuperAdmin, canAccessTenant, membershipTenantIds]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTenantId) {
      setSelectedTenantModules(null);
      setTenantModulesLoading(false);
      return;
    }

    setTenantModulesLoading(true);
    void (async () => {
      const userId = (await nexusDb.auth.getUser()).data.user?.id ?? null;

      const [{ data: tenantData, error: tenantError }, { data: aclData }] = await Promise.all([
        nexusDb
          .from("tenant_modules")
          .select("module_key, enabled")
          .eq("tenant_id", selectedTenantId),
        userId
          ? nexusDb
              .from("user_module_acl")
              .select("module_key, enabled")
              .eq("tenant_id", selectedTenantId)
              .eq("user_id", userId)
          : Promise.resolve({ data: [] as { module_key: string; enabled: boolean }[] }),
      ]);

      if (cancelled) return;
      if (tenantError) {
        console.error("Failed to load tenant modules:", tenantError.message);
        setSelectedTenantModules(null);
        setTenantModulesLoading(false);
        return;
      }

      // Base: tenant-level modules
      const map: TenantModulesMap = {};
      for (const row of tenantData ?? []) {
        const key = String((row as { module_key?: string }).module_key ?? "").trim();
        if (!key) continue;
        map[key] = (row as { enabled?: boolean }).enabled !== false;
      }

      // Override: user-level ACL (only applied when ACL rows exist for this user+tenant)
      const acl = aclData ?? [];
      if (acl.length > 0) {
        for (const row of acl) {
          const key = String((row as { module_key?: string }).module_key ?? "").trim();
          if (!key) continue;
          map[key] = (row as { enabled?: boolean }).enabled !== false;
        }
      }

      setSelectedTenantModules(map);
      setTenantModulesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTenantId]);

  const isModuleEnabled = useCallback(
    (moduleKey: string) => {
      if (!isSuperAdmin && membershipTenantIds.length > 0 && !selectedTenantId) {
        return false;
      }
      if (!selectedTenantId) return true;
      if (!selectedTenantModules) return true;
      return selectedTenantModules[moduleKey] !== false;
    },
    [isSuperAdmin, membershipTenantIds.length, selectedTenantId, selectedTenantModules]
  );

  const scopedTenantDisplayName = useMemo(() => {
    if (!selectedTenantId) return undefined;
    const row = memberships.find((m) => m.tenant_id === selectedTenantId);
    const fromMembership = relationName((row as { tenants?: unknown } | undefined)?.tenants);
    if (fromMembership) return fromMembership;
    const fromSelected = selectedTenant?.name?.trim();
    if (fromSelected) return fromSelected;
    return undefined;
  }, [selectedTenantId, memberships, selectedTenant?.name]);

  return (
    <TenantContext.Provider
      value={{
        selectedTenantId,
        setSelectedTenantId,
        selectedTenant,
        setSelectedTenant,
        selectedTenantModules,
        tenantModulesLoading,
        isModuleEnabled,
        scopedTenantDisplayName,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within TenantProvider");
  return ctx;
}
