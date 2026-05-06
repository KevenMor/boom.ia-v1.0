import { useEffect, useMemo, useState } from "react";
import { Images, Pencil, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSuiteGalleryThumbnailCandidateUrls } from "@/lib/suite-gallery-display";
import type { SuiteGallery } from "@/types/database";

type Props = {
  gallery: SuiteGallery;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
};

export function SuiteGalleryListRow({ gallery, onOpen, onEdit, onDelete }: Props) {
  const mediaList = Array.isArray(gallery.media_urls) ? gallery.media_urls : [];
  const photoCount = mediaList.filter((m) => (m.type as string)?.toLowerCase() === "photo").length;
  const videoCount = mediaList.filter((m) => (m.type as string)?.toLowerCase() === "video").length;
  const total = mediaList.length;

  const thumbCandidates = useMemo(
    () => getSuiteGalleryThumbnailCandidateUrls(gallery),
    [gallery.id, gallery.cover_image_url ?? "", JSON.stringify(gallery.media_urls ?? [])]
  );
  const thumbCandidateKey = thumbCandidates.join("|");
  const [thumbIndex, setThumbIndex] = useState(0);
  const [thumbExhausted, setThumbExhausted] = useState(false);

  useEffect(() => {
    setThumbIndex(0);
    setThumbExhausted(false);
  }, [gallery.id, thumbCandidateKey]);

  const thumbnailUrl =
    !thumbExhausted && thumbCandidates.length > 0 ? thumbCandidates[Math.min(thumbIndex, thumbCandidates.length - 1)] : null;

  const onThumbError = () => {
    if (thumbIndex + 1 < thumbCandidates.length) setThumbIndex((i) => i + 1);
    else setThumbExhausted(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-muted">
        {thumbnailUrl ? (
          <img
            key={thumbnailUrl}
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={onThumbError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="h-6 w-6 text-muted-foreground/35" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-foreground">{gallery.name}</h3>
        {gallery.description ? (
          <p className="truncate text-sm text-muted-foreground">{gallery.description}</p>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">Nenhuma mídia ainda</p>
        ) : null}
      </div>

      <div className="flex max-w-[40%] shrink-0 flex-wrap items-center justify-end gap-1 sm:max-w-none">
        {photoCount > 0 && (
          <Badge variant="secondary" className="text-[10px] font-normal tabular-nums">
            {photoCount} foto{photoCount !== 1 ? "s" : ""}
          </Badge>
        )}
        {videoCount > 0 && (
          <Badge variant="secondary" className="flex items-center gap-0.5 text-[10px] font-normal tabular-nums">
            <Play className="h-2.5 w-2.5" />
            {videoCount}
          </Badge>
        )}
        {total === 0 && <span className="text-xs text-muted-foreground">—</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Editar galeria"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Excluir galeria"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
