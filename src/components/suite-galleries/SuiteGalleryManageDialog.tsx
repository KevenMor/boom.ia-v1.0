import { useState } from "react";
import { X, ZoomIn, Video, Images, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SuiteGalleryMediaUpload } from "./SuiteGalleryMediaUpload";
import { SuiteGalleryFormDialog } from "./SuiteGalleryFormDialog";
import { useUpdateSuiteGallery } from "@/hooks/useSuiteGalleries";
import { useTenantContext } from "@/contexts/TenantContext";
import type { SuiteGallery, SuiteGalleryMedia } from "@/types/database";

type Props = {
  gallery: SuiteGallery;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SuiteGalleryManageDialog({ gallery, open, onOpenChange }: Props) {
  const { selectedTenantId } = useTenantContext();
  const update = useUpdateSuiteGallery();

  const [media, setMedia] = useState<SuiteGalleryMedia[]>(gallery.media_urls);
  const [lightbox, setLightbox] = useState<SuiteGalleryMedia | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleMediaChange = (updated: SuiteGalleryMedia[]) => {
    setMedia(updated);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      const coverUrl = media.find((m) => m.type === "photo")?.url ?? gallery.cover_image_url;
      await update.mutateAsync({
        id: gallery.id,
        media_urls: media,
        cover_image_url: coverUrl ?? null,
      });
      toast.success("Galeria salva.");
      setDirty(false);
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : ""));
    }
  };

  const removeMedia = async (idx: number) => {
    const updated = media.filter((_, i) => i !== idx);
    setMedia(updated);
    try {
      const coverUrl = updated.find((m) => m.type === "photo")?.url ?? null;
      await update.mutateAsync({
        id: gallery.id,
        media_urls: updated,
        cover_image_url: coverUrl,
      });
      toast.success("Mídia removida.");
    } catch (err: unknown) {
      toast.error("Erro ao remover: " + (err instanceof Error ? err.message : ""));
      setMedia(media);
    }
  };

  const photoCount = media.filter((m) => m.type === "photo").length;
  const videoCount = media.filter((m) => m.type === "video").length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-xl">{gallery.name}</DialogTitle>
                <div className="flex items-center gap-2">
                  {photoCount > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      <Images className="h-3 w-3 mr-1" />
                      {photoCount} foto{photoCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {videoCount > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      <Video className="h-3 w-3 mr-1" />
                      {videoCount} vídeo{videoCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar info
              </Button>
            </div>
          </DialogHeader>

          {gallery.description && (
            <p className="text-sm text-muted-foreground -mt-2">{gallery.description}</p>
          )}

          {/* Existing media grid */}
          {media.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {media.map((item, idx) => (
                <div
                  key={`${idx}-${item.url.slice(-32)}`}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/20"
                >
                  {item.type === "photo" ? (
                    <img
                      src={item.url}
                      alt=""
                      className="h-full w-full object-cover cursor-zoom-in transition-transform duration-200 group-hover:scale-105"
                      onClick={() => setLightbox(item)}
                    />
                  ) : (
                    <div
                      className="relative h-full w-full cursor-pointer"
                      onClick={() => setLightbox(item)}
                    >
                      <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity group-hover:bg-black/50">
                        <Video className="h-10 w-10 text-white/90" />
                      </div>
                    </div>
                  )}

                  {/* Zoom indicator */}
                  <div className="absolute bottom-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-background/80">
                      <ZoomIn className="h-3.5 w-3.5 text-foreground" />
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeMedia(idx); }}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-foreground opacity-0 shadow ring-1 ring-border transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                    aria-label="Remover"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {/* Caption */}
                  {item.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                      <p className="text-[11px] text-white line-clamp-1">{item.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload new media */}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-3">Adicionar mídias</p>
            <SuiteGalleryMediaUpload
              tenantId={selectedTenantId ?? undefined}
              galleryId={gallery.id}
              value={[]}
              onChange={(newItems) => {
                const updated = [...media, ...newItems];
                handleMediaChange(updated);
              }}
            />
          </div>

          {/* Save button when dirty */}
          {dirty && (
            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
                {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar galeria
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl bg-black/95 border-0 p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualizar mídia</DialogTitle>
          </DialogHeader>
          {lightbox?.type === "photo" ? (
            <img
              src={lightbox.url}
              alt=""
              className="max-h-[85vh] w-full object-contain rounded-lg"
            />
          ) : lightbox?.type === "video" ? (
            <video
              src={lightbox.url}
              controls
              autoPlay
              className="max-h-[85vh] w-full rounded-lg"
            />
          ) : null}
          {lightbox?.caption && (
            <p className="text-center text-sm text-white/70 mt-1">{lightbox.caption}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit info dialog */}
      <SuiteGalleryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        gallery={gallery}
      />
    </>
  );
}
