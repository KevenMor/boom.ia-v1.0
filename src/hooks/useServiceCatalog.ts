import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import type { CatalogCategory, CatalogItem, CatalogItemStatus, Professional } from "@/types/database";

export type CatalogListSort = "name_asc" | "name_desc" | "price_asc" | "price_desc" | "category";

export interface CatalogItemListRow extends CatalogItem {
  catalog_categories?: Pick<CatalogCategory, "id" | "name"> | null;
}

export function useCatalogCategories(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalog_categories", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CatalogCategory[]> => {
      const { data, error } = await nexusDb
        .from("catalog_categories")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as CatalogCategory[]) ?? [];
    },
  });
}

export function useProfessionalsList(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["professionals", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Professional[]> => {
      const { data, error } = await nexusDb
        .from("professionals")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data as Professional[]) ?? [];
    },
  });
}

export function useCatalogItemsList(params: {
  tenantId: string | null | undefined;
  search?: string;
  itemType?: "all" | "service" | "product";
  status?: "all" | CatalogItemStatus;
  sort?: CatalogListSort;
}) {
  const { tenantId, search, itemType = "all", status = "all", sort = "name_asc" } = params;

  return useQuery({
    queryKey: ["catalog_items", tenantId, search, itemType, status, sort],
    enabled: !!tenantId,
    queryFn: async (): Promise<CatalogItemListRow[]> => {
      let q = nexusDb
        .from("catalog_items")
        .select("*, catalog_categories(id, name)")
        .eq("tenant_id", tenantId!);

      if (itemType !== "all") {
        q = q.eq("item_type", itemType);
      }
      if (status !== "all") {
        q = q.eq("status", status);
      }
      const term = search?.trim();
      if (term) {
        q = q.ilike("name", `%${term}%`);
      }

      if (sort === "name_asc") q = q.order("name", { ascending: true });
      else if (sort === "name_desc") q = q.order("name", { ascending: false });
      else if (sort === "price_asc") q = q.order("price_standard", { ascending: true });
      else if (sort === "price_desc") q = q.order("price_standard", { ascending: false });
      else q = q.order("name", { ascending: true });

      const { data, error } = await q;
      if (error) throw error;
      let rows = (data as CatalogItemListRow[]) ?? [];

      if (sort === "category") {
        rows = [...rows].sort((a, b) => {
          const ca = a.catalog_categories?.name ?? "";
          const cb = b.catalog_categories?.name ?? "";
          if (ca !== cb) return ca.localeCompare(cb, "pt-BR");
          return (a.name ?? "").localeCompare(b.name ?? "", "pt-BR");
        });
      }

      return rows;
    },
  });
}

export function useCatalogItem(itemId: string | undefined, tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["catalog_item", itemId, tenantId],
    enabled: !!tenantId && !!itemId && itemId !== "new",
    queryFn: async (): Promise<CatalogItemListRow | null> => {
      const { data, error } = await nexusDb
        .from("catalog_items")
        .select("*, catalog_categories(id, name)")
        .eq("tenant_id", tenantId!)
        .eq("id", itemId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CatalogItemListRow) ?? null;
    },
  });
}

export function useCatalogItemLinks(itemId: string | undefined) {
  return useQuery({
    queryKey: ["catalog_item_links", itemId],
    enabled: !!itemId && itemId !== "new",
    queryFn: async () => {
      const [profRes, relRes] = await Promise.all([
        nexusDb.from("catalog_item_professionals").select("professional_id, is_default").eq("catalog_item_id", itemId!),
        nexusDb.from("catalog_item_related").select("related_catalog_item_id, sort_order").eq("catalog_item_id", itemId!),
      ]);
      if (profRes.error) throw profRes.error;
      if (relRes.error) throw relRes.error;
      return {
        professionals: (profRes.data ?? []) as { professional_id: string; is_default: boolean }[],
        related: (relRes.data ?? []) as { related_catalog_item_id: string; sort_order: number }[],
      };
    },
  });
}

export function usePatchCatalogItemStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; status: CatalogItemStatus }) => {
      const { error } = await nexusDb.from("catalog_items").update({ status: args.status }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog_items"] });
      void qc.invalidateQueries({ queryKey: ["catalog_item"] });
    },
  });
}

export function useDeleteCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await nexusDb.from("catalog_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog_items"] });
    },
  });
}
