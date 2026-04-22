import { Images, Pencil, Trash2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSuiteGalleryThumbnailUrl } from "@/lib/suite-gallery-display";
import type { SuiteGallery } from "@/types/database";

type Props = {
  gallery: SuiteGallery;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
};

export function SuiteGalleryCard({ gallery, onOpen, onEdit, onDelete }: Props) {
  const mediaList = Array.isArray(gallery.media_urls) ? gallery.media_urls : [];
  const photoCount = mediaList.filter((m) => m.type === "photo").length;
  const videoCount = mediaList.filter((m) => m.type === "video").length;
  const total = mediaList.length;
  const thumbnailUrl = getSuiteGalleryThumbnailUrl(gallery);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Cover image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={gallery.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="h-14 w-14 text-muted-foreground/30" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {/* Media count badge */}
        {total > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {photoCount > 0 && (
              <Badge className="bg-black/70 text-white hover:bg-black/70 text-[10px] px-1.5 py-0.5">
                {photoCount} foto{photoCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {videoCount > 0 && (
              <Badge className="bg-black/70 text-white hover:bg-black/70 text-[10px] px-1.5 py-0.5 flex items-center gap-0.5">
                <Play className="h-2.5 w-2.5" />
                {videoCount}
              </Badge>
            )}
          </div>
        )}

        {/* Action buttons — visible on hover */}
        <div className="absolute left-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-foreground shadow ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground"
            aria-label="Editar galeria"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-foreground shadow ring-1 ring-border transition-colors hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Excluir galeria"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground leading-tight">{gallery.name}</h3>
        {gallery.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{gallery.description}</p>
        )}
        {total === 0 && (
          <p className="mt-1 text-xs text-muted-foreground/60 italic">Nenhuma mídia ainda</p>
        )}
      </div>
    </div>
  );
}
