import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Lot, LotStatus } from "@/hooks/useLoteamentos";
import { lotStatusLabel, useDeleteLot, useReleaseLot } from "@/hooks/useLoteamentos";
import type { LotActionType } from "@/components/loteamentos/LotActionDialog";
import { cn } from "@/lib/utils";
import { Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function statusBadgeClass(status: LotStatus): string {
  if (status === "available") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30";
  if (status === "reserved") return "bg-amber-500/15 text-amber-900 dark:text-amber-400 border-amber-500/30";
  if (status === "sold") return "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30";
  return "bg-red-500/15 text-red-800 dark:text-red-400 border-red-500/30";
}

type Props = {
  lots: Lot[];
  tenantId: string;
  canManage?: boolean;
  selectedLotId?: string | null;
  onSelectLot: (lot: Lot) => void;
  onQuickAction?: (lot: Lot, action: LotActionType) => void;
  onDeleted?: (lotId: string) => void;
  className?: string;
};

export function LotTable({ lots, tenantId, canManage, selectedLotId, onSelectLot, onQuickAction, onDeleted, className }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LotStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<Lot | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<Lot | null>(null);
  const delLot = useDeleteLot();
  const releaseLot = useReleaseLot();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lots.filter((lot) => {
      if (statusFilter !== "all" && lot.status !== statusFilter) return false;
      if (!q) return true;
      const contact = lot.contacts?.name || "";
      return (
        lot.code.toLowerCase().includes(q) ||
        (lot.block ?? "").toLowerCase().includes(q) ||
        (lot.lot_number ?? "").toLowerCase().includes(q) ||
        contact.toLowerCase().includes(q)
      );
    });
  }, [lots, search, statusFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await delLot.mutateAsync({ id: deleteTarget.id, tenant_id: tenantId });
      toast.success(`Lote ${deleteTarget.code} removido.`);
      onDeleted?.(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover lote.");
    }
  };

  const handleRelease = async () => {
    if (!releaseTarget) return;
    try {
      await releaseLot.mutateAsync({ id: releaseTarget.id, tenant_id: tenantId });
      toast.success(`Lote ${releaseTarget.code} liberado.`);
      setReleaseTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao liberar lote.");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Buscar código, quadra ou contato…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 w-full text-base sm:h-9 sm:max-w-xs sm:text-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LotStatus | "all")}>
          <SelectTrigger className="h-11 w-full sm:h-9 sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile: cards */}
      <div className="max-h-[min(60dvh,520px)] space-y-2 overflow-y-auto overscroll-contain md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nenhum lote encontrado.
          </p>
        ) : (
          filtered.map((lot) => {
            const contactName = lot.contacts?.name;
            return (
              <div
                key={lot.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectLot(lot)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectLot(lot);
                  }
                }}
                className={cn(
                  "rounded-xl border border-border bg-card p-3 shadow-sm transition-colors",
                  "touch-manipulation active:bg-muted/40",
                  selectedLotId === lot.id && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{lot.code}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Quadra {lot.block ?? "—"} · Nº {lot.lot_number ?? "—"}
                      {lot.area_m2 != null ? ` · ${Number(lot.area_m2).toLocaleString("pt-BR")} m²` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0", statusBadgeClass(lot.status))}>
                    {lotStatusLabel(lot.status)}
                  </Badge>
                </div>
                {contactName ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">Contato: {contactName}</p>
                ) : null}
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {canManage && onQuickAction && lot.status === "available" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10 flex-1 border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-300"
                      onClick={() => onQuickAction(lot, "reserve")}
                    >
                      Reservar
                    </Button>
                  )}
                  {canManage && onQuickAction && lot.status === "reserved" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-10 flex-1 bg-slate-700 text-white hover:bg-slate-800"
                        onClick={() => onQuickAction(lot, "sell")}
                      >
                        Vender
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-10"
                        onClick={() => setReleaseTarget(lot)}
                      >
                        Liberar
                      </Button>
                    </>
                  )}
                  {canManage && lot.status === "blocked" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10 flex-1"
                      onClick={() => setReleaseTarget(lot)}
                    >
                      Liberar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    onClick={() => onSelectLot(lot)}
                  >
                    Detalhes
                  </Button>
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 w-10 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(lot)}
                      title="Excluir lote"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden max-h-[52vh] overflow-auto rounded-xl border border-slate-200 dark:border-border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Quadra</TableHead>
              <TableHead>Nº</TableHead>
              <TableHead className="text-right">m²</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="min-w-[220px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum lote encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((lot) => {
                const contactName = lot.contacts?.name;
                return (
                  <TableRow
                    key={lot.id}
                    className={cn("cursor-pointer", selectedLotId === lot.id && "bg-blue-50/80 dark:bg-blue-950/30")}
                    onClick={() => onSelectLot(lot)}
                  >
                    <TableCell className="font-medium">{lot.code}</TableCell>
                    <TableCell>{lot.block ?? "—"}</TableCell>
                    <TableCell>{lot.lot_number ?? "—"}</TableCell>
                    <TableCell className="text-right">{lot.area_m2 != null ? Number(lot.area_m2).toLocaleString("pt-BR") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusBadgeClass(lot.status)}>
                        {lotStatusLabel(lot.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-muted-foreground">
                      {contactName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {canManage && onQuickAction && lot.status === "available" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 border-amber-500/40 bg-amber-500/10 px-2 text-xs text-amber-900 hover:bg-amber-500/20 dark:text-amber-300"
                            onClick={() => onQuickAction(lot, "reserve")}
                          >
                            Reservar
                          </Button>
                        )}
                        {canManage && onQuickAction && lot.status === "reserved" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 bg-slate-700 px-2 text-xs text-white hover:bg-slate-800"
                              onClick={() => onQuickAction(lot, "sell")}
                            >
                              Confirmar venda
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => setReleaseTarget(lot)}
                            >
                              Liberar
                            </Button>
                          </>
                        )}
                        {canManage && lot.status === "blocked" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setReleaseTarget(lot)}
                          >
                            Liberar
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onSelectLot(lot)}
                        >
                          Detalhes
                        </Button>
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(lot)}
                            title="Excluir lote"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lote {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lote será removido do mapa e da lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={delLot.isPending}
            >
              {delLot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(releaseTarget)} onOpenChange={(o) => !o && setReleaseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar lote {releaseTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              O lote voltará para o status <strong>disponível</strong> e o vínculo com o contato será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleRelease();
              }}
              disabled={releaseLot.isPending}
            >
              {releaseLot.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
