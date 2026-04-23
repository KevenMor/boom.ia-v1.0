import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { createDefaultActionsForModule, type ModuleAction, type ModuleKey } from "@/lib/tenant-modules";

interface ModuleActionsMap {
  // module_key → set of allowed actions (null = all allowed)
  [moduleKey: string]: Set<ModuleAction> | null;
}

let cachedUserId: string | null = null;
let cachedTenantId: string | null = null;
let cachedMap: ModuleActionsMap | null = null;

/**
 * Returns a function `can(moduleKey, action)` that checks whether the current
 * user is allowed to perform an action within a module.
 *
 * Rules:
 * - superadmin → always true
 * - user has no ACL rows for this tenant → all actions allowed (inherits defaults)
 * - user has ACL rows → only actions in allowed_actions are permitted
 *   (null allowed_actions on a row = all actions for that module allowed)
 */
export function useModuleActions() {
  const { isSuperAdmin, user } = useAuth();
  const { selectedTenantId } = useTenantContext();
  const [actionsMap, setActionsMap] = useState<ModuleActionsMap | null>(cachedMap);

  useEffect(() => {
    if (isSuperAdmin || !user || !selectedTenantId) {
      setActionsMap(null);
      return;
    }

    // Use cache if same user+tenant
    if (cachedUserId === user.id && cachedTenantId === selectedTenantId && cachedMap) {
      setActionsMap(cachedMap);
      return;
    }

    void (async () => {
      const { data } = await nexusDb
        .from("user_module_acl")
        .select("module_key, enabled, allowed_actions")
        .eq("user_id", user.id)
        .eq("tenant_id", selectedTenantId);

      if (!data || data.length === 0) {
        setActionsMap(null);
        cachedMap = null;
        cachedUserId = user.id;
        cachedTenantId = selectedTenantId;
        return;
      }

      const map: ModuleActionsMap = {};
      for (const row of data) {
        const key = String((row as { module_key?: string }).module_key ?? "");
        const enabled = (row as { enabled?: boolean }).enabled !== false;
        const rawActions = (row as { allowed_actions?: string[] | null }).allowed_actions;

        if (!enabled) {
          map[key] = new Set(); // module disabled = no actions
        } else if (!rawActions || rawActions.length === 0) {
          map[key] = null; // null = all actions allowed
        } else {
          map[key] = new Set(rawActions as ModuleAction[]);
        }
      }

      cachedMap = map;
      cachedUserId = user.id;
      cachedTenantId = selectedTenantId;
      setActionsMap(map);
    })();
  }, [isSuperAdmin, user, selectedTenantId]);

  // Invalidate cache when tenant changes
  useEffect(() => {
    if (cachedTenantId && cachedTenantId !== selectedTenantId) {
      cachedMap = null;
    }
  }, [selectedTenantId]);

  const can = (moduleKey: ModuleKey, action: ModuleAction): boolean => {
    if (isSuperAdmin) return true;
    if (!actionsMap) return true; // no custom ACL = all allowed
    if (!(moduleKey in actionsMap)) return true; // module not in ACL = inherits default
    const allowed = actionsMap[moduleKey];
    if (allowed === null) return true; // null = all actions allowed
    return allowed.has(action);
  };

  return { can };
}
