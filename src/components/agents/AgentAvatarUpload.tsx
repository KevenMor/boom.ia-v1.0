import { useState, useEffect } from "react";
import { Check, X, Pencil } from "lucide-react";
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
  /** Layout grande estilo Stitch / Material (Editar agente premium). */
  layout?: "default" | "stitch";
  /** Tamanho do círculo no layout stitch (mobile-first: compact evita sobrepor campos). */
  stitchSize?: "compact" | "default";
}

const stitchCircle =
  "group relative flex shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-[#ccc3d8] bg-[#dce9ff] dark:border-border dark:bg-muted";

const stitchSizes = {
  compact: "h-20 w-20 sm:h-24 sm:w-24",
  default: "h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28",
} as const;

export function AgentAvatarUpload({
  currentUrl,
  onUploaded,
  className,
  layout = "default",
  stitchSize = "default",
}: Props) {
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

  if (layout === "stitch") {
    return (
      <div className={cn("flex w-full flex-col items-center gap-3 sm:items-start sm:gap-4", className)}>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className={cn(stitchCircle, stitchSizes[stitchSize])}
          >
            {displayUrl ? (
              <>
                <img src={displayUrl} alt="" className="h-full w-full object-cover object-top" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil className="h-6 w-6 text-white" />
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <span className="text-sm">?</span>
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              handleClear(e);
            }}
            className={cn(
              "absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80",
              !displayUrl && "hidden"
            )}
            title="Remover avatar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleShowMore}
          className="text-[12px] font-semibold tracking-wide text-[#630ed4] hover:underline dark:text-violet-400 md:self-start"
        >
          Alterar avatar
        </button>
        {showPicker ? (
          <div className="flex w-full flex-wrap justify-center gap-2 pt-1 sm:max-w-none sm:justify-start">
            {PRESET_AVATARS.map(({ url, label }) => (
              <button
                key={url}
                type="button"
                onClick={() => handleSelect(url)}
                className={cn(
                  "relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 transition-all",
                  "hover:ring-2 hover:ring-[#7c3aed]/50 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#7c3aed]",
                  displayUrl === url ? "border-[#7c3aed] ring-2 ring-[#7c3aed]" : "border-[#ccc3d8] dark:border-border"
                )}
                title={label}
              >
                <img src={url} alt={label} className="h-full w-full object-cover" />
                {selected === url && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#7c3aed]/30">
                    <Check className="h-3 w-3 text-white drop-shadow" strokeWidth={3} />
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Avatar do agente</p>

      {displayUrl && !showPicker ? (
        <div className="flex items-center gap-3">
          <div className="relative shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted/30 w-12 h-12 shadow-sm">
            <img src={displayUrl} alt="Avatar do agente" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={handleClear}
              className="absolute -top-0.5 -right-0.5 rounded-full bg-black/60 p-0.5 text-white transition-colors hover:bg-black/80"
              title="Remover avatar"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Avatar selecionado</p>
            <button type="button" onClick={handleShowMore} className="mt-0.5 text-xs text-primary hover:underline">
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
                "relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 transition-all",
                "hover:ring-2 hover:ring-primary/50 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary",
                displayUrl === url ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50"
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
