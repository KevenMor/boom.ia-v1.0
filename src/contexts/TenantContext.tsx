import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Tenant } from "@/types/database";

interface TenantContextValue {
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  /** Helper: the full tenant object (set by the selector) */
  selectedTenant: Tenant | null;
  setSelectedTenant: (t: Tenant | null) => void;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [selectedTenantId, setSelectedTenantIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("boomia-selected-tenant") || null;
    } catch {
      return null;
    }
  });
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const setSelectedTenantId = useCallback((id: string | null) => {
    setSelectedTenantIdRaw(id);
    try {
      if (id) localStorage.setItem("boomia-selected-tenant", id);
      else localStorage.removeItem("boomia-selected-tenant");
    } catch {}
  }, []);

  return (
    <TenantContext.Provider value={{ selectedTenantId, setSelectedTenantId, selectedTenant, setSelectedTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within TenantProvider");
  return ctx;
}
