import { useState } from "react";
import { Images, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuiteGalleries } from "@/hooks/useSuiteGalleries";
import { useTenantContext } from "@/contexts/TenantContext";
import { SuiteGalleryCard } from "@/components/suite-galleries/SuiteGalleryCard";
import { SuiteGalleryFormDialog } from "@/components/suite-galleries/SuiteGalleryFormDialog";
import { SuiteGalleryManageDialog } from "@/components/suite-galleries/SuiteGalleryManageDialog";
import { DeleteSuiteGalleryDialog } from "@/components/suite-galleries/DeleteSuiteGalleryDialog";
import type { SuiteGallery } from "@/types/database";

export default function SuiteGalleriesPage() {
  const { selectedTenantId } = useTenantContext();
  const { data, isLoading } = useSuiteGalleries(selectedTenantId);
  const galleries = data?.data ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editGallery, setEditGallery] = useState<SuiteGallery | null>(null);
  const [manageGallery, setManageGallery] = useState<SuiteGallery | null>(null);
  const [deleteGallery, setDeleteGallery] = useState<SuiteGallery | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-3">
          <h2 className="text-lg font-medium text-foreground">Galeria</h2>
          {!isLoading && (
            <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
              {galleries.length} galeria{galleries.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova galeria
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
          ))}
        </div>
      ) : galleries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center text-muted-foreground">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-border">
            <Images className="h-10 w-10 opacity-30" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Nenhuma galeria criada</p>
            <p className="text-sm">Crie a primeira galeria para organizar fotos e vídeos por tema ou categoria.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar primeira galeria
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {galleries.map((gallery, i) => (
            <div
              key={gallery.id}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <SuiteGalleryCard
                gallery={gallery}
                onOpen={() => setManageGallery(gallery)}
                onEdit={(e) => { e.stopPropagation(); setEditGallery(gallery); }}
                onDelete={(e) => { e.stopPropagation(); setDeleteGallery(gallery); }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <SuiteGalleryFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <SuiteGalleryFormDialog
        gallery={editGallery}
        open={!!editGallery}
        onOpenChange={(o) => !o && setEditGallery(null)}
      />

      {manageGallery && (
        <SuiteGalleryManageDialog
          gallery={manageGallery}
          open={!!manageGallery}
          onOpenChange={(o) => !o && setManageGallery(null)}
        />
      )}

      <DeleteSuiteGalleryDialog
        gallery={deleteGallery}
        open={!!deleteGallery}
        onOpenChange={(o) => !o && setDeleteGallery(null)}
      />
    </div>
  );
}
