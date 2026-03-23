import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Tenant } from "@/types/database";
import { nexusDb } from "@/integrations/supabase/nexus-client";
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
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { canAccessTenant, isSuperAdmin } = useAuth();
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

  const setSelectedTenantId = useCallback((id: string | null) => {
    if (id && !isSuperAdmin && !canAccessTenant(id)) {
      return;
    }
    setSelectedTenantIdRaw(id);
    try {
      if (id) localStorage.setItem("boomia-selected-tenant", id);
      else localStorage.removeItem("boomia-selected-tenant");
    } catch {
      return;
    }
  }, [canAccessTenant, isSuperAdmin]);

  useEffect(() => {
    if (selectedTenantId && !isSuperAdmin && !canAccessTenant(selectedTenantId)) {
      setSelectedTenantIdRaw(null);
      setSelectedTenant(null);
    }
  }, [selectedTenantId, isSuperAdmin, canAccessTenant]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTenantId) {
      setSelectedTenantModules(null);
      setTenantModulesLoading(false);
      return;
    }

    setTenantModulesLoading(true);
    void (async () => {
      const { data, error } = await nexusDb
        .from("tenant_modules")
        .select("module_key, enabled")
        .eq("tenant_id", selectedTenantId);

      if (cancelled) return;
      if (error) {
        console.error("Failed to load tenant modules:", error.message);
        setSelectedTenantModules(null);
      } else {
        const map: TenantModulesMap = {};
        for (const row of data ?? []) {
          const key = String((row as { module_key?: string }).module_key ?? "").trim();
          if (!key) continue;
          map[key] = (row as { enabled?: boolean }).enabled !== false;
        }
        setSelectedTenantModules(map);
      }
      setTenantModulesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTenantId]);

  const isModuleEnabled = useCallback(
    (moduleKey: string) => {
      if (!selectedTenantId) return true;
      if (!selectedTenantModules) return true;
      return selectedTenantModules[moduleKey] !== false;
    },
    [selectedTenantId, selectedTenantModules]
  );

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
