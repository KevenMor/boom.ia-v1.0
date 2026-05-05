import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 15;
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  tenantId: string | undefined;
  value: string[] | undefined;
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  className?: string;
};

async function uploadImage(tenantId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const id = crypto.randomUUID();
  const path = `occurrences/${tenantId}/${id}.${safeExt}`;
  const { error: uploadError } = await supabase.storage.from("agent-avatars").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("agent-avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function OccurrencePhotoUpload({ tenantId, value, onChange, disabled, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const urls = value ?? [];

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    if (!tenantId) {
      toast.error("Selecione um tenant.");
      e.target.value = "";
      return;
    }

    const remaining = MAX_PHOTOS - urls.length;
    if (remaining <= 0) {
      toast.error(`No máximo ${MAX_PHOTOS} fotos.`);
      e.target.value = "";
      return;
    }

    const picked = Array.from(list);
    if (picked.length > remaining) {
      toast.warning(`No máximo ${MAX_PHOTOS} fotos no total; só serão adicionadas ${remaining}.`);
    }
    const toProcess = picked.slice(0, remaining);

    setUploading(true);
    try {
      let next = [...urls];
      let added = 0;
      for (const file of toProcess) {
        if (!file.type.startsWith("image/")) {
          toast.error(`Ignorado (não é imagem): ${file.name}`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: máximo 5 MB.`);
          continue;
        }
        try {
          const url = await uploadImage(tenantId, file);
          next = [...next, url];
          onChange(next);
          added += 1;
        } catch (err: unknown) {
          toast.error("Erro no upload: " + (err instanceof Error ? err.message : ""));
        }
      }
      if (added === 1) toast.success("Foto carregada.");
      else if (added > 1) toast.success(`${added} fotos carregadas.`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(urls.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Fotos da ocorrência</Label>
      <p className="text-[11px] text-muted-foreground">
        Opcional — até {MAX_PHOTOS} imagens, 5 MB cada (só envio de ficheiros; pode seleccionar várias de uma vez).
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {urls.map((url, idx) => (
          <div
            key={`${idx}-${url.slice(-48)}`}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted/20"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeAt(idx)}
              className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
              aria-label="Remover foto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {urls.length < MAX_PHOTOS ? (
          <button
            type="button"
            disabled={disabled || uploading || !tenantId}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 p-2 text-muted-foreground transition-colors",
              "hover:border-primary/50 hover:bg-muted/40",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
            <span className="text-center text-[11px] leading-tight">{uploading ? "A enviar…" : "Adicionar fotos"}</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
        disabled={disabled || uploading || !tenantId}
      />
      {urls.length > 0 ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={clearAll} disabled={disabled}>
          <X className="h-4 w-4" />
          Remover todas
        </Button>
      ) : null}
    </div>
  );
}
