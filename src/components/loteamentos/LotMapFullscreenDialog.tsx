import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LotMapCanvas } from "@/components/loteamentos/LotMapCanvas";
import { LotMapLegend } from "@/components/loteamentos/LotMapLegend";
import type { Lot, LotMapGeometry } from "@/hooks/useLoteamentos";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mapImageUrl: string | null;
  lots: Lot[];
  selectedLotId?: string | null;
  onSelectLot: (lot: Lot) => void;
  drawMode?: boolean;
  onDrawModeChange?: (enabled: boolean) => void;
  onDrawRect?: (geometry: LotMapGeometry) => void;
  canManage?: boolean;
};

export function LotMapFullscreenDialog({
  open,
  onOpenChange,
  title,
  mapImageUrl,
  lots,
  selectedLotId,
  onSelectLot,
  drawMode,
  onDrawModeChange,
  onDrawRect,
  canManage,
}: Props) {
  const handleDrawRect = (geometry: LotMapGeometry) => {
    onDrawRect?.(geometry);
    onDrawModeChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed left-[2vw] top-[2vh] z-50 flex h-[96vh] w-[96vw] max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden rounded-lg p-4 sm:p-5">
        <DialogHeader className="shrink-0 space-y-2 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LotMapLegend />
            {canManage && onDrawModeChange && (
              <Button
                type="button"
                size="sm"
                variant={drawMode ? "default" : "outline"}
                onClick={() => onDrawModeChange(!drawMode)}
              >
                {drawMode ? "Cancelar desenho" : "Desenhar lote"}
              </Button>
            )}
          </div>
          {drawMode && (
            <p className="text-left text-xs text-muted-foreground">
              Clique e arraste no mapa para marcar a área do lote.
            </p>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <LotMapCanvas
            mapImageUrl={mapImageUrl}
            lots={lots}
            selectedLotId={selectedLotId}
            onSelectLot={onSelectLot}
            drawMode={drawMode && canManage}
            onDrawRect={handleDrawRect}
            className="min-h-[min(72vh,900px)]"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LotMapExpandButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="absolute right-2 top-2 z-10 h-8 gap-1.5 bg-white/90 px-2.5 shadow-sm backdrop-blur-sm hover:bg-white dark:bg-card/90 dark:hover:bg-card"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title="Expandir mapa"
    >
      <Maximize2 className="h-3.5 w-3.5" />
      <span className="text-xs">Tela cheia</span>
    </Button>
  );
}
