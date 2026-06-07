import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { navGroups } from "@/components/layout/AppSidebar";

export function useFirstEnabledRoute(): string {
  const { isSuperAdmin } = useAuth();
  const { isModuleEnabled, permissionsReady } = useTenantContext();

  return useMemo(() => {
    if (!permissionsReady && !isSuperAdmin) {
      return "/dashboard";
    }
    for (const group of navGroups) {
      for (const item of group.items) {
        if (isSuperAdmin) return item.to;
        if (!item.moduleKey || isModuleEnabled(item.moduleKey)) return item.to;
      }
    }
    return "/dashboard";
  }, [isSuperAdmin, isModuleEnabled, permissionsReady]);
}
