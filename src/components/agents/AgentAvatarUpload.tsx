import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** 4 avatares pré-definidos (3D estilo Pixar/Disney) */
const PRESET_AVATARS = [
  { url: "/avatars/agent-1.png", label: "Avatar 1" },
  { url: "/avatars/agent-2.png", label: "Avatar 2" },
  { url: "/avatars/agent-3.png", label: "Avatar 3" },
  { url: "/avatars/agent-4.png", label: "Avatar 4" },
];

interface Props {
  agentId?: string;
  currentUrl?: string | null;
  onUploaded: (url: string | null) => void;
  className?: string;
}

export function AgentAvatarUpload({ currentUrl, onUploaded, className }: Props) {
  const [selected, setSelected] = useState<string | null>(currentUrl ?? null);
  const [showPicker, setShowPicker] = useState(!currentUrl);

  useEffect(() => {
    setSelected(currentUrl ?? null);
    setShowPicker(!currentUrl);
  }, [currentUrl]);

  const handleSelect = (url: string) => {
    setSelected(url);
    setShowPicker(false);
    onUploaded(url);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(null);
    onUploaded(null);
    setShowPicker(true);
  };

  const handleShowMore = () => {
    setShowPicker(true);
  };

  const displayUrl = selected || currentUrl;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Avatar do agente</p>

      {displayUrl && !showPicker ? (
        <div className="flex items-center gap-3">
          <div className="relative shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted/30 w-12 h-12 shadow-sm">
            <img
              src={displayUrl}
              alt="Avatar do agente"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute -top-0.5 -right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80 transition-colors"
              title="Remover avatar"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">Avatar selecionado</p>
            <button
              type="button"
              onClick={handleShowMore}
              className="text-xs text-primary hover:underline mt-0.5"
            >
              Escolher outro
            </button>
          </div>
        </div>
      ) : null}

      {showPicker && (
        <div className="flex flex-wrap gap-2">
          {PRESET_AVATARS.map(({ url, label }) => (
            <button
              key={url}
              type="button"
              onClick={() => handleSelect(url)}
              className={cn(
                "relative w-11 h-11 shrink-0 rounded-full overflow-hidden border-2 transition-all",
                "hover:ring-2 hover:ring-primary/50 hover:scale-105",
                "focus:outline-none focus:ring-2 focus:ring-primary",
                displayUrl === url
                  ? "border-primary ring-2 ring-primary"
                  : "border-border hover:border-primary/50"
              )}
              title={label}
            >
              <img src={url} alt={label} className="h-full w-full object-cover" />
              {selected === url && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                  <Check className="h-3 w-3 text-primary drop-shadow" strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
