import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Props {
  agentId?: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  className?: string;
}

export function AgentAvatarUpload({ agentId, currentUrl, onUploaded, className }: Props) {
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

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${agentId ?? crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("agent-avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("agent-avatars").getPublicUrl(path);
      // Add cache-busting param
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      onUploaded(publicUrl);
      toast.success("Avatar atualizado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message ?? "desconhecido"));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = preview || currentUrl;

  return (
    <div
      className={cn(
        "group relative cursor-pointer",
        className
      )}
      onClick={() => inputRef.current?.click()}
    >
      <Avatar className="h-16 w-16 border-2 border-border transition-all group-hover:border-primary/50">
        {displayUrl ? (
          <AvatarImage src={displayUrl} alt="Avatar do agente" className="object-cover" />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary">
          <Camera className="h-5 w-5" />
        </AvatarFallback>
      </Avatar>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        ) : (
          <Camera className="h-5 w-5 text-white" />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
