import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ContactAvatarUploadProps {
  contactId: string;
  currentUrl?: string | null;
  onUploaded: (url: string | null) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-16 w-16",
  md: "h-24 w-24",
  lg: "h-32 w-32",
};

export function ContactAvatarUpload({
  contactId,
  currentUrl,
  onUploaded,
  className,
  size = "lg",
}: ContactAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 2MB");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `contacts/${contactId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("agent-avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("agent-avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      onUploaded(url);
      toast.success("Foto atualizada!");
    } catch (err: unknown) {
      toast.error("Erro no upload: " + (err instanceof Error ? err.message : ""));
      setPreview(null);
    } finally {
      setUploading(false);
    }
    e.target.value = "";
  };

  const displayUrl = preview || currentUrl;

  return (
    <div
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-full border-2 border-border bg-muted/30 transition-all hover:ring-2 hover:ring-primary/50",
        sizeClasses[size],
        className
      )}
      onClick={() => inputRef.current?.click()}
    >
      {displayUrl ? (
        <img
          src={displayUrl}
          alt="Foto do contato"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Camera className="h-8 w-8" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        ) : (
          <Camera className="h-8 w-8 text-white" />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />
    </div>
  );
}
