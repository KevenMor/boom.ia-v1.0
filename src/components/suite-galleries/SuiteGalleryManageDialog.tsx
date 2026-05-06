import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, Video, Images, Pencil, Loader2, ImagePlus, Bot, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SuiteGalleryMediaUpload, uploadSuiteGalleryCoverImage } from "./SuiteGalleryMediaUpload";
import { SuiteGalleryFormDialog } from "./SuiteGalleryFormDialog";
import { useMoveSuiteGalleryMedia, useSuiteGalleries, useUpdateSuiteGallery } from "@/hooks/useSuiteGalleries";
import { useTenantContext } from "@/contexts/TenantContext";
import { normalizeSuiteGalleryMediaUrl, normalizeSuiteGalleryMediaRows } from "@/lib/suite-gallery-display";
import type { SuiteGallery, SuiteGalleryMedia } from "@/types/database";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_COVER_BYTES = 20 * 1024 * 1024;

function mediaUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.search = "";
    u.hash = "";
    return u.pathname.toLowerCase();
  } catch {
    return url.split("?")[0]?.trim().toLowerCase() ?? "";
  }
}

function sanitizeMediaForApi(items: SuiteGalleryMedia[]): SuiteGalleryMedia[] {
  return items.map((m) => {
    const w = m.llm_send_when?.trim();
    return { ...m, llm_send_when: w || undefined };
  });
}

type Props = {
  gallery: SuiteGallery;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SuiteGalleryManageDialog({ gallery, open, onOpenChange }: Props) {
  const { selectedTenantId } = useTenantContext();
  const update = useUpdateSuiteGallery();
  const moveMedia = useMoveSuiteGalleryMedia();
  const { data: galleriesRes } = useSuiteGalleries(open ? selectedTenantId : null);
  const otherGalleries = (galleriesRes?.data ?? []).filter((g) => g.id !== gallery.id);

  const [media, setMedia] = useState<SuiteGalleryMedia[]>(() => normalizeSuiteGalleryMediaRows(gallery.media_urls as unknown));
  const [coverDraft, setCoverDraft] = useState<string | null>(gallery.cover_image_url?.trim() || null);
  const [lightbox, setLightbox] = useState<SuiteGalleryMedia | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<SuiteGalleryMedia | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMedia(normalizeSuiteGalleryMediaRows(gallery.media_urls as unknown));
    setCoverDraft(gallery.cover_image_url?.trim() || null);
    setDirty(false);
  }, [open, gallery.id]);

  function resolvePersistedCover(m: SuiteGalleryMedia[], explicit: string | null): string | null {
    const firstPhoto = m.find((x) => x.type === "photo" && x.url?.trim())?.url?.trim() || null;
    return (explicit?.trim() || firstPhoto) || null;
  }

  const handleMediaChange = (updated: SuiteGalleryMedia[]) => {
    setMedia(updated);
    setDirty(true);
  };

  const patchMediaField = (idx: number, partial: Partial<SuiteGalleryMedia>) => {
    setMedia((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...partial };
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      const payloadMedia = sanitizeMediaForApi(media);
      await update.mutateAsync({
        id: gallery.id,
        media_urls: payloadMedia,
        cover_image_url: resolvePersistedCover(payloadMedia, coverDraft),
      });
      toast.success("Galeria salva.");
      setMedia(payloadMedia);
      setDirty(false);
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : ""));
    }
  };

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedTenantId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Use um arquivo de imagem (JPG, PNG, WebP…).");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      toast.error("Imagem muito grande (máx. 20 MB).");
      return;
    }
    setCoverUploading(true);
    try {
      const url = await uploadSuiteGalleryCoverImage(selectedTenantId, gallery.id, file);
      setCoverDraft(url);
      setDirty(true);
      toast.success("Capa definida. Clique em Salvar para confirmar.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha no upload da capa.");
    } finally {
      setCoverUploading(false);
    }
  };

  const clearCover = () => {
    setCoverDraft(null);
    setDirty(true);
  };

  const openMoveDialog = (item: SuiteGalleryMedia) => {
    setMoveItem(item);
    setMoveTargetId("");
    setMoveOpen(true);
  };

  const handleConfirmMove = async () => {
    if (!moveItem || !moveTargetId) {
      toast.error("Selecione a galeria de destino.");
      return;
    }
    const destName = otherGalleries.find((g) => g.id === moveTargetId)?.name ?? "galeria";
    try {
      await moveMedia.mutateAsync({
        sourceId: gallery.id,
        targetGalleryId: moveTargetId,
        mediaUrl: moveItem.url,
      });
      const k = mediaUrlKey(moveItem.url);
      const nextMedia = media.filter((m) => mediaUrlKey(m.url) !== k);
      setMedia(nextMedia);
      if (coverDraft?.trim() && mediaUrlKey(coverDraft) === k) {
        setCoverDraft(resolvePersistedCover(nextMedia, null));
        setDirty(true);
      }
      toast.success(`Mídia transferida para “${destName}”.`);
      setMoveOpen(false);
      setMoveItem(null);
      setMoveTargetId("");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes("target_gallery_full")) {
        toast.error("A galeria de destino já tem o máximo de 30 mídias.");
      } else {
        toast.error("Não foi possível transferir: " + raw);
      }
    }
  };

  const removeMedia = async (idx: number) => {
    const updated = sanitizeMediaForApi(media.filter((_, i) => i !== idx));
    setMedia(updated);
    try {
      const nextCover = resolvePersistedCover(updated, coverDraft);
      await update.mutateAsync({
        id: gallery.id,
        media_urls: updated,
        cover_image_url: nextCover,
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

          {/* Capa (miniatura em listagem — útil para galerias só com vídeo) */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Capa da galeria</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Imagem de destaque na lista do painel. Para galerias só com vídeo, envie uma capa aqui (por exemplo um frame do vídeo exportado como JPG).
                Se não houver capa nem foto na galeria, usamos o ícone vazio.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative h-20 w-28 overflow-hidden rounded-lg border border-border bg-muted shrink-0">
                {(() => {
                  const thumb =
                    coverDraft?.trim() ||
                    media.find((m) => m.type === "photo" && m.url?.trim())?.url?.trim() ||
                    null;
                  return thumb ? (
                    <img
                      src={normalizeSuiteGalleryMediaUrl(thumb)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Images className="h-8 w-8 text-muted-foreground/35" />
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverFile}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={coverUploading || !selectedTenantId}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  {coverUploading ? "Enviando…" : "Enviar imagem de capa"}
                </Button>
                {coverDraft?.trim() ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearCover}>
                    Remover capa
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Existing media grid */}
          {media.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Ícone{" "}
                <Bot className="inline h-3 w-3 align-text-bottom text-primary" /> em cada item: quando o agente deve enviar essa mídia
                (ex.: vídeo institucional se o cliente não conhece o resort).
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {media.map((item, idx) => (
                <div
                  key={`${idx}-${item.url.slice(-32)}`}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/20"
                >
                  {item.type === "photo" ? (
                    <img
                      src={normalizeSuiteGalleryMediaUrl(item.url)}
                      alt=""
                      className="h-full w-full object-cover cursor-zoom-in transition-transform duration-200 group-hover:scale-105"
                      onClick={() => setLightbox(item)}
                    />
                  ) : (
                    <div
                      className="relative h-full w-full cursor-pointer"
                      onClick={() => setLightbox(item)}
                    >
                      <video src={normalizeSuiteGalleryMediaUrl(item.url)} className="h-full w-full object-cover" muted playsInline />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity group-hover:bg-black/50">
                        <Video className="h-10 w-10 text-white/90" />
                      </div>
                    </div>
                  )}

                  {otherGalleries.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMoveDialog(item);
                      }}
                      className="absolute left-1 top-16 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-background/95 text-foreground shadow ring-1 ring-border transition-colors hover:bg-muted hover:text-primary"
                      aria-label="Transferir para outra galeria"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "absolute left-1 top-9 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-background/95 text-foreground shadow ring-1 ring-border transition-colors hover:bg-muted",
                          item.llm_send_when?.trim() && "ring-primary/60 text-primary"
                        )}
                        aria-label="Orientação para o agente — quando enviar"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Bot className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[min(22rem,calc(100vw-2rem))] space-y-2"
                      align="start"
                      side="right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div>
                        <Label className="text-xs font-medium">
                          Quando enviar este {item.type === "video" ? "vídeo" : "arquivo"}
                        </Label>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Só o agente vê este texto. Descreva o gatilho na conversa (palavras do cliente, tema, fase do atendimento).
                        </p>
                      </div>
                      <Textarea
                        className="min-h-[100px] text-sm resize-y"
                        placeholder='Ex.: Quando o cliente disser que não conhece o Vale Suíço, primeira vez, ou pedir para conhecer o resort.'
                        value={item.llm_send_when ?? ""}
                        onChange={(e) => patchMediaField(idx, { llm_send_when: e.target.value })}
                      />
                    </PopoverContent>
                  </Popover>

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

      <AlertDialog
        open={moveOpen}
        onOpenChange={(o) => {
          setMoveOpen(o);
          if (!o) {
            setMoveItem(null);
            setMoveTargetId("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Transferir para outra galeria</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <span className="block">
                O arquivo permanece no armazenamento (o link continua válido); só a organização no painel muda.
                A capa e a lista de mídias das duas galerias são atualizadas automaticamente.
              </span>
              <div className="space-y-2 pt-1">
                <Label className="text-xs text-foreground">Galeria de destino</Label>
                <Select value={moveTargetId || undefined} onValueChange={setMoveTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherGalleries.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={moveMedia.isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => void handleConfirmMove()}
              disabled={!moveTargetId || moveMedia.isPending}
              className="gap-2"
            >
              {moveMedia.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Transferir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl bg-black/95 border-0 p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Visualizar mídia</DialogTitle>
          </DialogHeader>
          {lightbox?.type === "photo" ? (
            <img
              src={normalizeSuiteGalleryMediaUrl(lightbox.url)}
              alt=""
              className="max-h-[85vh] w-full object-contain rounded-lg"
            />
          ) : lightbox?.type === "video" ? (
            <video
              src={normalizeSuiteGalleryMediaUrl(lightbox.url)}
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
