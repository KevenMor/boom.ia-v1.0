import { useQuery } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";

export interface TenantMember {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
}

/**
 * Membros do tenant para atribuir compromisso a um corretor.
 * Usa memberships + profiles (proxy com service role no backend).
 */
export function useTenantMembers(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-members", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantMember[]> => {
      const { data: memberships, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("user_id, role")
        .eq("tenant_id", tenantId!);
      if (memErr) throw memErr;
      const rows = memberships ?? [];
      if (rows.length === 0) return [];

      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (profErr) throw profErr;

      const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]));

      return rows.map((r) => ({
        user_id: r.user_id as string,
        role: String(r.role ?? "tenant_user"),
        full_name: nameById.get(r.user_id as string) ?? null,
        email: null,
      }));
    },
  });
}
