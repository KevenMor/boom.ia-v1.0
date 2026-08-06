import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { useAuth } from "@/contexts/AuthContext";
import { filterCalendarsForUser, isCalendarScopedUser } from "@/lib/calendar-ownership";
import type { Calendar } from "@/types/calendar";

export function useCalendars(tenantId: string | undefined) {
  const { user, isSuperAdmin, isTenantAdmin, loading: authLoading } = useAuth();
  // Enquanto perfil/memberships carregam, todo usuário parece tenant_user —
  // aplicar o escopo aqui esconderia as agendas de admins durante o bootstrap.
  const scoped =
    !authLoading &&
    isCalendarScopedUser({
      isSuperAdmin,
      isTenantAdmin: isTenantAdmin(tenantId),
    });

  const query = useQuery({
    queryKey: ["calendars", tenantId, scoped ? user?.id ?? "scoped" : "all"],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendars")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data as Calendar[];
    },
  });

  const data = useMemo(() => {
    if (!query.data) return query.data;
    return filterCalendarsForUser(query.data, { userId: user?.id, scoped });
  }, [query.data, user?.id, scoped]);

  return { ...query, data };
}

export function useCreateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (calendar: Partial<Calendar>) => {
      const { data, error } = await supabase
        .from("calendars")
        .insert(calendar)
        .select()
        .single();
      if (error) throw error;
      return data as Calendar;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["calendars", d.tenant_id] }),
  });
}

export function useUpdateCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Calendar> & { id: string }) => {
      const { data, error } = await supabase
        .from("calendars")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Calendar;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["calendars", d.tenant_id] }),
  });
}

export function useDeleteCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase.from("calendars").delete().eq("id", id);
      if (error) throw error;
      return tenantId;
    },
    onSuccess: (tenantId) => qc.invalidateQueries({ queryKey: ["calendars", tenantId] }),
  });
}
