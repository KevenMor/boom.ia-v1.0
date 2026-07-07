import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";

export type LotStatus = "available" | "reserved" | "sold" | "blocked";

export interface LotDevelopment {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  address: string | null;
  description: string | null;
  status: "active" | "inactive";
  map_image_url: string | null;
  map_config: Record<string, unknown> | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface LotMapGeometry {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Lot {
  id: string;
  tenant_id: string;
  development_id: string;
  code: string;
  block: string | null;
  lot_number: string | null;
  area_m2: number | null;
  status: LotStatus;
  list_price: number | null;
  map_geometry: LotMapGeometry | null;
  contact_id: string | null;
  reserved_at: string | null;
  reserved_until: string | null;
  sold_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { id: string; name: string | null; email: string | null; phone: string | null } | null;
}

export interface LotDevelopmentSummary extends LotDevelopment {
  counts: {
    available: number;
    reserved: number;
    sold: number;
    blocked: number;
    total: number;
  };
}

export const loteamentosKeys = {
  all: ["loteamentos"] as const,
  summary: (tenantId: string) => [...loteamentosKeys.all, "summary", tenantId] as const,
  developments: (tenantId: string) => [...loteamentosKeys.all, "developments", tenantId] as const,
  lots: (tenantId: string, developmentId?: string, status?: string) =>
    [...loteamentosKeys.all, "lots", tenantId, developmentId ?? "", status ?? ""] as const,
};

function upsertDevelopmentInCache(
  qc: ReturnType<typeof useQueryClient>,
  tenantId: string,
  development: LotDevelopment,
) {
  qc.setQueryData<{ data: LotDevelopment[] }>(loteamentosKeys.developments(tenantId), (prev) => {
    const list = prev?.data ?? [];
    const idx = list.findIndex((d) => d.id === development.id);
    if (idx === -1) return { data: [...list, development] };
    const next = [...list];
    next[idx] = development;
    return { data: next };
  });
}

export function useLotDevelopmentsSummary(tenantId: string | undefined) {
  return useQuery({
    queryKey: loteamentosKeys.summary(tenantId ?? ""),
    queryFn: () =>
      callAPI<{ data: LotDevelopmentSummary[] }>(`/loteamentos/summary?tenant_id=${tenantId}`, { method: "GET" }),
    enabled: !!tenantId,
  });
}

export function useLotDevelopments(tenantId: string | undefined, options?: { refetchOnMount?: boolean | "always" }) {
  return useQuery({
    queryKey: loteamentosKeys.developments(tenantId ?? ""),
    queryFn: () =>
      callAPI<{ data: LotDevelopment[] }>(`/loteamentos/developments?tenant_id=${tenantId}`, { method: "GET" }),
    enabled: !!tenantId,
    refetchOnMount: options?.refetchOnMount ?? "always",
  });
}

export function useLots(tenantId: string | undefined, developmentId?: string, status?: LotStatus) {
  const params = new URLSearchParams({ tenant_id: tenantId ?? "" });
  if (developmentId) params.set("development_id", developmentId);
  if (status) params.set("status", status);
  return useQuery({
    queryKey: loteamentosKeys.lots(tenantId ?? "", developmentId, status),
    queryFn: () => callAPI<{ data: Lot[] }>(`/loteamentos/lots?${params}`, { method: "GET" }),
    enabled: !!tenantId,
  });
}

export function useCreateLotDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LotDevelopment> & { tenant_id: string; name: string }) =>
      callAPI<{ data: LotDevelopment }>("/loteamentos/developments", { method: "POST", body }),
    onSuccess: (res, v) => {
      if (res?.data) upsertDevelopmentInCache(qc, v.tenant_id, res.data);
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useUpdateLotDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id, ...body }: { id: string; tenant_id: string } & Partial<LotDevelopment>) =>
      callAPI<{ data: LotDevelopment }>(`/loteamentos/developments/${id}`, { method: "PATCH", body }),
    onSuccess: (res, v) => {
      if (res?.data) upsertDevelopmentInCache(qc, v.tenant_id, res.data);
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useDeleteLotDevelopment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id }: { id: string; tenant_id: string }) =>
      callAPI<{ success: boolean }>(`/loteamentos/developments/${id}`, { method: "DELETE" }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.developments(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useCreateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Lot> & { tenant_id: string; development_id: string; code: string }) =>
      callAPI<{ data: Lot }>("/loteamentos/lots", { method: "POST", body }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useUpdateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id, ...body }: { id: string; tenant_id: string } & Partial<Lot>) =>
      callAPI<{ data: Lot }>(`/loteamentos/lots/${id}`, { method: "PATCH", body }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useDeleteLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id }: { id: string; tenant_id: string }) =>
      callAPI<{ success: boolean }>(`/loteamentos/lots/${id}`, { method: "DELETE" }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useReserveLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tenant_id,
      contact_id,
      reserved_until,
      notes,
    }: {
      id: string;
      tenant_id: string;
      contact_id: string;
      reserved_until?: string | null;
      notes?: string | null;
    }) =>
      callAPI<{ data: Lot }>(`/loteamentos/lots/${id}/reserve`, {
        method: "POST",
        body: { contact_id, reserved_until, notes },
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useSellLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      tenant_id,
      contact_id,
      notes,
    }: {
      id: string;
      tenant_id: string;
      contact_id: string;
      notes?: string | null;
    }) =>
      callAPI<{ data: Lot }>(`/loteamentos/lots/${id}/sell`, {
        method: "POST",
        body: { contact_id, notes },
      }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useReleaseLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id }: { id: string; tenant_id: string }) =>
      callAPI<{ data: Lot }>(`/loteamentos/lots/${id}/release`, { method: "POST" }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useBlockLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tenant_id, notes }: { id: string; tenant_id: string; notes?: string | null }) =>
      callAPI<{ data: Lot }>(`/loteamentos/lots/${id}/block`, { method: "POST", body: { notes } }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function useBulkLots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      tenant_id: string;
      development_id: string;
      lots: Array<{
        code: string;
        block?: string | null;
        lot_number?: string | null;
        area_m2?: number | null;
        status?: LotStatus;
        list_price?: number | null;
        map_geometry?: LotMapGeometry | null;
        notes?: string | null;
      }>;
    }) => callAPI<{ data: Lot[]; upserted: number }>("/loteamentos/lots/bulk", { method: "POST", body }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: loteamentosKeys.lots(v.tenant_id) });
      void qc.invalidateQueries({ queryKey: loteamentosKeys.summary(v.tenant_id) });
    },
  });
}

export function lotStatusLabel(status: LotStatus): string {
  if (status === "available") return "Disponível";
  if (status === "reserved") return "Reservado";
  if (status === "sold") return "Vendido";
  return "Bloqueado";
}

export function lotStatusColor(status: LotStatus): string {
  if (status === "available") return "fill-emerald-500/40 stroke-emerald-600";
  if (status === "reserved") return "fill-amber-400/45 stroke-amber-600";
  if (status === "sold") return "fill-slate-400/50 stroke-slate-600";
  return "fill-red-400/40 stroke-red-600";
}
