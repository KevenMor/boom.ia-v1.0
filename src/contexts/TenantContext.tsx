import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Tenant } from "@/types/database";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { relationName } from "@/lib/utils";
import {
  pickSingleAclTenantId,
  resolveTenantModuleAccess,
} from "@/lib/resolve-tenant-module-access";
import {
  clearTenantModulesCacheForUser,
  readTenantModulesCache,
  writeTenantModulesCache,
} from "@/lib/tenant-modules-cache";
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
  /** Módulos do tenant resolvidos (ou superadmin / sem tenant necessário). */
  permissionsReady: boolean;
  /** Bloqueia o shell na primeira entrada até permissões estarem prontas. */
  bootstrapPending: boolean;
  isModuleEnabled: (moduleKey: string) => boolean;
  /** Nome do tenant selecionado (membership + objeto do switcher); não depende só de useTenants. */
  scopedTenantDisplayName: string | undefined;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { canAccessTenant, isSuperAdmin, memberships, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTenantId, setSelectedTenantIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem("boomia-selected-tenant") || null;
    } catch {
      return null;
    }
  });
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedTenantModules, setSelectedTenantModules] = useState<TenantModulesMap | null>(null);
  const [usesCustomUserAcl, setUsesCustomUserAcl] = useState(false);
  const [tenantModulesLoading, setTenantModulesLoading] = useState(false);
  const [hasBootstrappedPermissions, setHasBootstrappedPermissions] = useState(false);
  const prevTenantId = useRef(selectedTenantId);
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (prevUserId.current === userId) return;
    const prev = prevUserId.current;
    prevUserId.current = userId;

    setHasBootstrappedPermissions(false);
    setSelectedTenantModules(null);
    setUsesCustomUserAcl(false);
    setSelectedTenant(null);
    if (prev) clearTenantModulesCacheForUser(prev);

    if (!userId) {
      setSelectedTenantIdRaw(null);
      return;
    }

    try {
      setSelectedTenantIdRaw(localStorage.getItem("boomia-selected-tenant") || null);
    } catch {
      setSelectedTenantIdRaw(null);
    }
  }, [user?.id]);

  useEffect(() => {
    if (prevTenantId.current !== selectedTenantId) {
      prevTenantId.current = selectedTenantId;
      queryClient.invalidateQueries();
    }
  }, [selectedTenantId, queryClient]);

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
  const membershipTenantKey = membershipTenantIds.join("|");
  const userId = user?.id;

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

    if (authLoading || !userId) {
      if (!authLoading) {
        setSelectedTenantModules(null);
        setUsesCustomUserAcl(false);
        setTenantModulesLoading(false);
      }
      return;
    }

    const hydrateFromCache = (tenantId: string): boolean => {
      const cached = readTenantModulesCache(userId, tenantId);
      if (!cached) return false;
      setSelectedTenantModules(cached.modules);
      setUsesCustomUserAcl(cached.usesCustomUserAcl);
      return true;
    };

    void (async () => {
      let tenantId = selectedTenantId;

      if (!isSuperAdmin && membershipTenantIds.length > 0) {
        const allowed = new Set(membershipTenantIds);
        if (!tenantId || !allowed.has(tenantId)) {
          tenantId = membershipTenantIds[0] ?? null;
          if (tenantId !== selectedTenantId) {
            if (cancelled) return;
            setSelectedTenantIdRaw(tenantId);
            try {
              localStorage.setItem("boomia-selected-tenant", tenantId);
            } catch {
              /* ignore */
            }
            return;
          }
        }

        const { data: aclTenantRows } = await nexusDb
          .from("user_module_acl")
          .select("tenant_id")
          .eq("user_id", userId);
        if (cancelled) return;

        const preferredTenantId = pickSingleAclTenantId(aclTenantRows ?? []);
        if (
          preferredTenantId &&
          allowed.has(preferredTenantId) &&
          preferredTenantId !== selectedTenantId
        ) {
          setSelectedTenantIdRaw(preferredTenantId);
          try {
            localStorage.setItem("boomia-selected-tenant", preferredTenantId);
          } catch {
            /* ignore */
          }
          return;
        }

        tenantId = selectedTenantId;
      }

      if (!tenantId) {
        if (cancelled) return;
        setSelectedTenantModules(null);
        setUsesCustomUserAcl(false);
        setTenantModulesLoading(false);
        return;
      }

      const hasCachedModules = hydrateFromCache(tenantId);
      if (!hasCachedModules) {
        setTenantModulesLoading(true);
        setSelectedTenantModules(null);
      }

      const [
        { data: tenantData, error: tenantError },
        { data: aclData },
        { data: tenantRow }
      ] = await Promise.all([
        nexusDb
          .from("tenant_modules")
          .select("module_key, enabled")
          .eq("tenant_id", tenantId),
        nexusDb
          .from("user_module_acl")
          .select("module_key, enabled")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId),
        nexusDb
          .from("tenants")
          .select("*")
          .eq("id", tenantId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      if (tenantError) {
        console.error("Failed to load tenant modules:", tenantError.message);
        if (!hasCachedModules) {
          setSelectedTenantModules({});
          setUsesCustomUserAcl(false);
        }
        setTenantModulesLoading(false);
        return;
      }

      if (tenantRow) {
        setSelectedTenant(tenantRow);
      }

      const resolved = resolveTenantModuleAccess(tenantData ?? [], aclData ?? []);
      setSelectedTenantModules(resolved.modules);
      setUsesCustomUserAcl(resolved.usesCustomUserAcl);
      writeTenantModulesCache(userId, tenantId, resolved.modules, resolved.usesCustomUserAcl);
      setTenantModulesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, selectedTenantId, userId, isSuperAdmin, membershipTenantKey]);

  const permissionsReady = useMemo(() => {
    if (authLoading || !user) return false;
    if (isSuperAdmin) return true;
    if (membershipTenantIds.length === 0) return true;
    if (!selectedTenantId) return false;
    return !tenantModulesLoading && selectedTenantModules !== null;
  }, [
    authLoading,
    user,
    isSuperAdmin,
    membershipTenantIds.length,
    selectedTenantId,
    tenantModulesLoading,
    selectedTenantModules,
  ]);

  useEffect(() => {
    if (!user) {
      setHasBootstrappedPermissions(false);
      return;
    }
    if (permissionsReady) {
      setHasBootstrappedPermissions(true);
    }
  }, [user, permissionsReady]);

  const bootstrapPending = !!user && !hasBootstrappedPermissions && !permissionsReady;

  const isModuleEnabled = useCallback(
    (moduleKey: string) => {
      if (isSuperAdmin) return true;
      if (membershipTenantIds.length > 0 && !selectedTenantId) {
        return false;
      }
      if (!selectedTenantId) return true;
      if (tenantModulesLoading) return false;
      if (!selectedTenantModules) return false;
      if (usesCustomUserAcl) {
        return selectedTenantModules[moduleKey] === true;
      }
      return selectedTenantModules[moduleKey] !== false;
    },
    [
      isSuperAdmin,
      membershipTenantIds.length,
      selectedTenantId,
      selectedTenantModules,
      tenantModulesLoading,
      usesCustomUserAcl,
    ]
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
        permissionsReady,
        bootstrapPending,
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
