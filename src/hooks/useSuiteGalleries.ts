import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { callAPI } from "@/lib/api-client";
import type { SuiteGallery } from "@/types/database";

export function useSuiteGalleries(tenantId?: string | null) {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenant_id", tenantId);

  return useQuery({
    queryKey: ["suite_galleries", tenantId],
    queryFn: () =>
      callAPI<{ data: SuiteGallery[]; total: number }>(
        `/suite-galleries?${params.toString()}`,
        { method: "GET" }
      ),
    enabled: !!tenantId,
  });
}

export function useCreateSuiteGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: Partial<SuiteGallery>) =>
      callAPI<SuiteGallery>("/suite-galleries", { method: "POST", body: item }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suite_galleries"] }),
  });
}

export function useUpdateSuiteGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<SuiteGallery> & { id: string }) =>
      callAPI<SuiteGallery>(`/suite-galleries/${id}`, { method: "PATCH", body: updates }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suite_galleries"] }),
  });
}

export function useDeleteSuiteGallery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      callAPI(`/suite-galleries/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suite_galleries"] }),
  });
}

/** Transfere um arquivo (foto/vídeo) da galeria origem para outra galeria do mesmo tenant. */
export function useMoveSuiteGalleryMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { sourceId: string; targetGalleryId: string; mediaUrl: string }) =>
      callAPI<{ source: SuiteGallery; target: SuiteGallery }>(
        `/suite-galleries/${args.sourceId}/move-media`,
        {
          method: "POST",
          body: { target_gallery_id: args.targetGalleryId, media_url: args.mediaUrl },
        }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suite_galleries"] }),
  });
}
