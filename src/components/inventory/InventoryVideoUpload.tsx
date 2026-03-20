import { useState, useRef } from "react";
import { Video, Loader2, Film } from "lucide-react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_SIZE_MB = 100;
const ALLOWED_TYPES = ["video/mp4", "video/webm"];

interface Props {
  inventoryId: string;
  tenantId?: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  className?: string;
}

export function InventoryVideoUpload({
  inventoryId,
  tenantId,
  currentUrl,
  onUploaded,
  className,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Selecione um vídeo MP4 ou WebM");
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`Vídeo deve ter no máximo ${MAX_SIZE_MB}MB`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = tenantId ? `${tenantId}/${inventoryId}.${ext}` : `${inventoryId}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("inventory-videos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("inventory-videos").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      onUploaded(publicUrl);
      toast.success("Vídeo enviado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message ?? "desconhecido"));
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const displayUrl = preview || currentUrl;

  return (
    <div
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-lg bg-gradient-to-br from-card to-muted/40 border border-border transition-all hover:ring-2 hover:ring-primary/30",
        className
      )}
      onClick={() => inputRef.current?.click()}
    >
      {displayUrl ? (
        <div className="flex aspect-video items-center justify-center p-2">
          <video
            src={displayUrl}
            className="max-h-24 w-full object-contain rounded"
            controls
            muted
            playsInline
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-muted-foreground aspect-video">
          <Film className="h-8 w-8" />
          <span className="text-[11px]">Clique para adicionar vídeo detalhado</span>
          <span className="text-[10px] opacity-70">MP4 ou WebM, até {MAX_SIZE_MB}MB</span>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        ) : (
          <Video className="h-6 w-6 text-white" />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
