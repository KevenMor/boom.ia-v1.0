import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEmbedLoteamentosOptional } from "@/contexts/EmbedLoteamentosContext";

export function useLoteamentosTenantScope() {
  const embed = useEmbedLoteamentosOptional();
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();

  if (embed?.ready) {
    return {
      selectedTenantId: embed.tenantId,
      scopedTenantDisplayName: embed.tenantName,
      canManage: true,
      canEdit: true,
    };
  }

  const canManage = Boolean(selectedTenantId && (isSuperAdmin || isTenantAdmin(selectedTenantId)));
  return {
    selectedTenantId,
    scopedTenantDisplayName,
    canManage,
    canEdit: canManage,
  };
}
