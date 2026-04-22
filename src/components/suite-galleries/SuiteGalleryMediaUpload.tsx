import { useRef, useState } from "react";
import { Camera, Video, Loader2, X } from "lucide-react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SuiteGalleryMedia } from "@/types/database";

const MAX_ITEMS = 30;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type Props = {
  tenantId: string | undefined;
  galleryId?: string;
  value: SuiteGalleryMedia[];
  onChange: (media: SuiteGalleryMedia[]) => void;
  disabled?: boolean;
  className?: string;
};

async function uploadFile(
  tenantId: string,
  galleryId: string,
  file: File,
  type: "photo" | "video"
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || (type === "photo" ? "jpg" : "mp4");
  const id = crypto.randomUUID();
  const path = `${tenantId}/${galleryId}/${type}-${id}.${ext}`;
  const { error } = await supabase.storage.from("suite-galleries").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("suite-galleries").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function SuiteGalleryMediaUpload({
  tenantId,
  galleryId,
  value,
  onChange,
  disabled,
  className,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploadingSet, setUploadingSet] = useState<Set<number>>(new Set());

  const remaining = MAX_ITEMS - value.length;
  const isUploading = uploadingSet.size > 0;

  const addItem = (item: SuiteGalleryMedia) => {
    onChange([...value, item]);
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handlePhotoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (!tenantId) { toast.error("Tenant não identificado."); return; }
    const gId = galleryId || "new";

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) { toast.error(`Ignorado (não é imagem): ${file.name}`); continue; }
      if (file.size > MAX_PHOTO_BYTES) { toast.error(`${file.name}: máximo 20 MB.`); continue; }

      const tmpId = Date.now() + i;
      setUploadingSet((s) => new Set(s).add(tmpId));
      try {
        const url = await uploadFile(tenantId, gId, file, "photo");
        addItem({ url, type: "photo" });
        toast.success("Foto carregada.");
      } catch (err: unknown) {
        toast.error("Erro no upload: " + (err instanceof Error ? err.message : ""));
      } finally {
        setUploadingSet((s) => { const n = new Set(s); n.delete(tmpId); return n; });
      }
    }
  };

  const handleVideoFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (!tenantId) { toast.error("Tenant não identificado."); return; }
    const gId = galleryId || "new";

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file.type.startsWith("video/")) { toast.error(`Ignorado (não é vídeo): ${file.name}`); continue; }
      if (file.size > MAX_VIDEO_BYTES) { toast.error(`${file.name}: máximo 200 MB.`); continue; }

      const tmpId = Date.now() + i + 1000;
      setUploadingSet((s) => new Set(s).add(tmpId));
      try {
        const url = await uploadFile(tenantId, gId, file, "video");
        addItem({ url, type: "video" });
        toast.success("Vídeo carregado.");
      } catch (err: unknown) {
        toast.error("Erro no upload: " + (err instanceof Error ? err.message : ""));
      } finally {
        setUploadingSet((s) => { const n = new Set(s); n.delete(tmpId); return n; });
      }
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
        {value.map((item, idx) => (
          <div
            key={`${idx}-${item.url.slice(-32)}`}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted/20"
          >
            {item.type === "photo" ? (
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="relative h-full w-full">
                <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Video className="h-8 w-8 text-white/80" />
                </div>
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeAt(idx)}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-background/90 text-foreground opacity-0 shadow ring-1 ring-border transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 disabled:pointer-events-none"
              aria-label="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* Upload photo button */}
        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled || isUploading || !tenantId}
            onClick={() => photoRef.current?.click()}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition-colors",
              "hover:border-primary/50 hover:bg-muted/40",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            {isUploading
              ? <Loader2 className="h-6 w-6 animate-spin" />
              : <Camera className="h-6 w-6" />}
            <span className="text-[11px] leading-tight text-center px-1">
              {isUploading ? "Enviando…" : "Foto"}
            </span>
          </button>
        )}

        {/* Upload video button */}
        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled || isUploading || !tenantId}
            onClick={() => videoRef.current?.click()}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition-colors",
              "hover:border-primary/50 hover:bg-muted/40",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <Video className="h-6 w-6" />
            <span className="text-[11px] leading-tight text-center px-1">Vídeo</span>
          </button>
        )}
      </div>

      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoFiles} disabled={disabled || isUploading} />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/mov,video/*" multiple className="hidden" onChange={handleVideoFiles} disabled={disabled || isUploading} />

      <p className="text-[11px] text-muted-foreground">
        Até {MAX_ITEMS} mídias — fotos até 20 MB · vídeos até 200 MB
      </p>
    </div>
  );
}
