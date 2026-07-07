import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LotMapCanvas } from "@/components/loteamentos/LotMapCanvas";
import { LotMapLegend } from "@/components/loteamentos/LotMapLegend";
import { LotMapExpandButton, LotMapFullscreenDialog } from "@/components/loteamentos/LotMapFullscreenDialog";
import { LotTable } from "@/components/loteamentos/LotTable";
import { LotActionDialog, type LotActionType } from "@/components/loteamentos/LotActionDialog";
import { DevelopmentFormDialog } from "@/components/loteamentos/DevelopmentFormDialog";
import { useLoteamentosTenantScope } from "@/hooks/useLoteamentosTenantScope";
import { useEmbedLoteamentosOptional } from "@/contexts/EmbedLoteamentosContext";
import {
  useBulkLots,
  useCreateLot,
  useLotDevelopments,
  useLots,
  type Lot,
  type LotMapGeometry,
} from "@/hooks/useLoteamentos";
import { toast } from "sonner";

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";

function parseCsvLots(text: string): Array<{
  code: string;
  block?: string;
  lot_number?: string;
  area_m2?: number;
  status?: Lot["status"];
}> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const hasHeader = lines[0].toLowerCase().includes("code") || lines[0].toLowerCase().includes("código");
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const [code, block, lot_number, areaRaw, statusRaw] = parts;
      if (!code) return null;
      const area_m2 = areaRaw ? Number(areaRaw.replace(",", ".")) : undefined;
      const status = statusRaw as Lot["status"] | undefined;
      return {
        code,
        block: block || undefined,
        lot_number: lot_number || undefined,
        area_m2: Number.isFinite(area_m2) ? area_m2 : undefined,
        status: status && ["available", "reserved", "sold", "blocked"].includes(status) ? status : undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

export default function DevelopmentMapPage() {
  const { developmentId } = useParams<{ developmentId: string }>();
  const { selectedTenantId, canManage } = useLoteamentosTenantScope();
  const embed = useEmbedLoteamentosOptional();
  const basePath = embed?.basePath ?? "/loteamentos";

  const { data: devsQ, isLoading: loadingDev } = useLotDevelopments(selectedTenantId ?? undefined);
  const { data: lotsQ, isLoading: loadingLots } = useLots(selectedTenantId ?? undefined, developmentId);
  const createLot = useCreateLot();
  const bulkLots = useBulkLots();

  const development = useMemo(
    () => (devsQ?.data ?? []).find((d) => d.id === developmentId),
    [devsQ?.data, developmentId],
  );
  const lots = lotsQ?.data ?? [];

  const counts = useMemo(() => {
    const c = { available: 0, reserved: 0, sold: 0, blocked: 0, total: lots.length };
    for (const lot of lots) {
      c[lot.status] += 1;
    }
    return c;
  }, [lots]);

  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionInitial, setActionInitial] = useState<LotActionType | undefined>();
  const [drawMode, setDrawMode] = useState(false);
  const [newLotOpen, setNewLotOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editDevOpen, setEditDevOpen] = useState(false);
  const [mapFullscreenOpen, setMapFullscreenOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newBlock, setNewBlock] = useState("");
  const [newLotNumber, setNewLotNumber] = useState("");
  const [newArea, setNewArea] = useState("");
  const [pendingGeometry, setPendingGeometry] = useState<LotMapGeometry | null>(null);

  const openLot = (lot: Lot, action?: LotActionType) => {
    setSelectedLot(lot);
    setActionInitial(action);
    setActionOpen(true);
  };

  const handleDrawRect = (geometry: LotMapGeometry) => {
    setPendingGeometry(geometry);
    setDrawMode(false);
    setMapFullscreenOpen(false);
    setNewLotOpen(true);
  };

  const handleCreateLot = async () => {
    if (!selectedTenantId || !developmentId || !newCode.trim()) {
      toast.error("Informe o código do lote.");
      return;
    }
    try {
      await createLot.mutateAsync({
        tenant_id: selectedTenantId,
        development_id: developmentId,
        code: newCode.trim(),
        block: newBlock.trim() || null,
        lot_number: newLotNumber.trim() || null,
        area_m2: newArea ? Number(newArea.replace(",", ".")) : null,
        map_geometry: pendingGeometry,
        status: "available",
      });
      toast.success("Lote criado.");
      setNewLotOpen(false);
      setNewCode("");
      setNewBlock("");
      setNewLotNumber("");
      setNewArea("");
      setPendingGeometry(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar lote.");
    }
  };

  const handleBulkImport = async () => {
    if (!selectedTenantId || !developmentId) return;
    const parsed = parseCsvLots(bulkText);
    if (parsed.length === 0) {
      toast.error("Nenhuma linha válida no CSV.");
      return;
    }
    try {
      const result = await bulkLots.mutateAsync({
        tenant_id: selectedTenantId,
        development_id: developmentId,
        lots: parsed,
      });
      toast.success(`${result.upserted ?? parsed.length} lotes importados.`);
      setBulkOpen(false);
      setBulkText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    }
  };

  if (!selectedTenantId || !developmentId) {
    return (
      <div className={col}>
        <p className="py-12 text-center text-sm text-muted-foreground">Empreendimento não encontrado.</p>
      </div>
    );
  }

  if (loadingDev || loadingLots) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando mapa…
      </div>
    );
  }

  if (!development) {
    return (
      <div className={col}>
        <p className="py-12 text-center text-sm text-muted-foreground">Empreendimento não encontrado.</p>
        <div className="text-center">
          <Button type="button" variant="outline" asChild>
            <Link to={`${basePath}/empreendimentos`}>Voltar</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className={`${col} space-y-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to={`${basePath}/empreendimentos`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Empreendimentos
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{development.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {counts.available} disponíveis · {counts.reserved} reservados · {counts.sold} vendidos · {counts.blocked}{" "}
              bloqueados
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditDevOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar empreendimento
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!development.map_image_url}
                onClick={() => setMapFullscreenOpen(true)}
              >
                Tela cheia
              </Button>
              <Button
                type="button"
                variant={drawMode ? "default" : "outline"}
                size="sm"
                onClick={() => setDrawMode((v) => !v)}
              >
                {drawMode ? "Cancelar desenho" : "Desenhar lote no mapa"}
              </Button>
              <Button type="button" size="sm" onClick={() => setNewLotOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo lote
              </Button>
            </div>
          )}
        </div>

        <LotMapLegend />

        <div className="flex flex-col gap-6">
          <div className="relative w-full">
            {development.map_image_url && (
              <LotMapExpandButton onClick={() => setMapFullscreenOpen(true)} />
            )}
            <LotMapCanvas
              mapImageUrl={development.map_image_url}
              lots={lots}
              selectedLotId={selectedLot?.id}
              onSelectLot={openLot}
              drawMode={drawMode && canManage}
              onDrawRect={handleDrawRect}
              className="min-h-[min(48vh,480px)] max-h-[58vh]"
            />
          </div>

          <LotTable
            lots={lots}
            tenantId={selectedTenantId}
            canManage={canManage}
            selectedLotId={selectedLot?.id}
            onSelectLot={(lot) => openLot(lot)}
            onQuickAction={(lot, action) => openLot(lot, action)}
            onDeleted={(id) => {
              if (selectedLot?.id === id) {
                setSelectedLot(null);
                setActionOpen(false);
              }
            }}
            className="w-full"
          />
        </div>
      </div>

      <LotMapFullscreenDialog
        open={mapFullscreenOpen}
        onOpenChange={setMapFullscreenOpen}
        title={`Mapa — ${development.name}`}
        mapImageUrl={development.map_image_url}
        lots={lots}
        selectedLotId={selectedLot?.id}
        onSelectLot={(lot) => {
          openLot(lot);
          setMapFullscreenOpen(false);
        }}
        drawMode={drawMode}
        onDrawModeChange={setDrawMode}
        onDrawRect={handleDrawRect}
        canManage={canManage}
      />

      <DevelopmentFormDialog
        tenantId={selectedTenantId}
        development={development}
        open={editDevOpen}
        onOpenChange={setEditDevOpen}
      />

      <LotActionDialog
        lot={selectedLot}
        tenantId={selectedTenantId}
        open={actionOpen}
        initialAction={actionInitial}
        onOpenChange={(open) => {
          setActionOpen(open);
          if (!open) setActionInitial(undefined);
        }}
      />

      <Dialog open={newLotOpen} onOpenChange={setNewLotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lote</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Q1-L01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quadra</Label>
                <Input value={newBlock} onChange={(e) => setNewBlock(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={newLotNumber} onChange={(e) => setNewLotNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Área (m²)</Label>
              <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            </div>
            {pendingGeometry && (
              <p className="text-xs text-muted-foreground">Posição no mapa definida pelo retângulo desenhado.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewLotOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCreateLot()} disabled={createLot.isPending}>
              {createLot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar lotes (CSV)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Colunas: código, quadra, número, área m², status (opcional). Separador vírgula, ponto-e-vírgula ou tab.
          </p>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            placeholder={"code,block,lot_number,area_m2,status\nQ1-L01,Q1,01,1200,available"}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleBulkImport()} disabled={bulkLots.isPending}>
              {bulkLots.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
