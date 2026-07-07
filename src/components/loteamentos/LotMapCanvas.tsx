import { useCallback, useMemo, useRef, useState } from "react";
import type { Lot, LotMapGeometry } from "@/hooks/useLoteamentos";
import { lotStatusColor } from "@/hooks/useLoteamentos";
import { normalizeSuiteGalleryMediaUrl } from "@/lib/suite-gallery-display";
import { cn } from "@/lib/utils";

type Props = {
  mapImageUrl: string | null;
  lots: Lot[];
  selectedLotId?: string | null;
  onSelectLot: (lot: Lot) => void;
  drawMode?: boolean;
  onDrawRect?: (geometry: LotMapGeometry) => void;
  className?: string;
};

function rectToSvgPoints(geom: LotMapGeometry, w: number, h: number): string {
  const x1 = geom.x * w;
  const y1 = geom.y * h;
  const x2 = (geom.x + geom.w) * w;
  const y2 = (geom.y + geom.h) * h;
  return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
}

export function LotMapCanvas({
  mapImageUrl,
  lots,
  selectedLotId,
  onSelectLot,
  drawMode,
  onDrawRect,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<LotMapGeometry | null>(null);

  const resolvedMapUrl = useMemo(() => {
    if (!mapImageUrl?.trim()) return null;
    return normalizeSuiteGalleryMediaUrl(mapImageUrl.trim());
  }, [mapImageUrl]);

  const normFromEvent = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!drawMode || !onDrawRect) return;
    const pt = normFromEvent(e);
    if (!pt) return;
    setDrawing(pt);
    setPreview({ type: "rect", x: pt.x, y: pt.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !drawMode) return;
    const pt = normFromEvent(e);
    if (!pt) return;
    const x = Math.min(drawing.x, pt.x);
    const y = Math.min(drawing.y, pt.y);
    const w = Math.abs(pt.x - drawing.x);
    const h = Math.abs(pt.y - drawing.y);
    setPreview({ type: "rect", x, y, w, h });
  };

  const handleMouseUp = () => {
    if (!drawMode || !onDrawRect || !preview || preview.w < 0.005 || preview.h < 0.005) {
      setDrawing(null);
      setPreview(null);
      return;
    }
    onDrawRect(preview);
    setDrawing(null);
    setPreview(null);
  };

  if (!resolvedMapUrl) {
    return (
      <div
        className={cn(
          "flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-muted-foreground dark:border-border dark:bg-muted/30",
          className,
        )}
      >
        Adicione uma imagem de mapa no cadastro do empreendimento.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden rounded-xl border border-slate-200 dark:border-border", className)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: drawMode ? "crosshair" : "default" }}
    >
      <img
        src={resolvedMapUrl}
        alt="Mapa de lotes"
        className="block h-auto max-h-[inherit] w-full select-none"
        draggable={false}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {lots.map((lot) => {
          const geom = lot.map_geometry;
          if (!geom || geom.type !== "rect") return null;
          const points = rectToSvgPoints(geom, 100, 100);
          const selected = lot.id === selectedLotId;
          return (
            <polygon
              key={lot.id}
              points={points}
              className={cn(
                lotStatusColor(lot.status),
                "stroke-[0.35] transition-opacity hover:opacity-90",
                selected && "stroke-[0.6] opacity-100 ring-2 ring-blue-500",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onSelectLot(lot);
              }}
            >
              <title>{`${lot.code} — ${lot.status}`}</title>
            </polygon>
          );
        })}
        {preview && (
          <polygon
            points={rectToSvgPoints(preview, 100, 100)}
            className="fill-blue-400/30 stroke-blue-600 stroke-[0.4]"
          />
        )}
      </svg>
    </div>
  );
}
