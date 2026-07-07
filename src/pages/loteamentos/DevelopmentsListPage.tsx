import { useState } from "react";
import { Link } from "react-router-dom";
import { LandPlot, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoteamentosSubNav } from "@/components/loteamentos/LoteamentosSubNav";
import { DevelopmentFormDialog } from "@/components/loteamentos/DevelopmentFormDialog";
import { useLoteamentosTenantScope } from "@/hooks/useLoteamentosTenantScope";
import { useEmbedLoteamentosOptional } from "@/contexts/EmbedLoteamentosContext";
import {
  useDeleteLotDevelopment,
  useLotDevelopments,
  useLotDevelopmentsSummary,
  type LotDevelopment,
  type LotDevelopmentSummary,
} from "@/hooks/useLoteamentos";
import { toast } from "sonner";
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

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";
const card =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-border dark:bg-card sm:p-6";

export default function DevelopmentsListPage() {
  const { selectedTenantId, scopedTenantDisplayName, canManage } = useLoteamentosTenantScope();
  const embed = useEmbedLoteamentosOptional();
  const basePath = embed?.basePath ?? "/loteamentos";

  const { data, isLoading } = useLotDevelopmentsSummary(selectedTenantId ?? undefined);
  const { data: devsFull } = useLotDevelopments(selectedTenantId ?? undefined);
  const delDev = useDeleteLotDevelopment();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LotDevelopment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LotDevelopment | null>(null);

  const developments = data?.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (dev: LotDevelopmentSummary) => {
    const full = devsFull?.data?.find((d) => d.id === dev.id);
    setEditing(full ?? dev);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selectedTenantId) return;
    try {
      await delDev.mutateAsync({ id: deleteTarget.id, tenant_id: selectedTenantId });
      toast.success("Empreendimento removido.");
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover.");
    }
  };

  if (!selectedTenantId) {
    return (
      <div className={col}>
        <p className="py-12 text-center text-sm text-muted-foreground">Selecione um tenant para ver os empreendimentos.</p>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {!embed?.ready && (
        <div className={col}>
          <h1 className="text-2xl font-semibold tracking-tight">Gestão de lotes</h1>
          {scopedTenantDisplayName && (
            <p className="mt-1 text-sm text-muted-foreground">{scopedTenantDisplayName}</p>
          )}
          <LoteamentosSubNav />
        </div>
      )}

      <div className={`${col} mt-6`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {developments.length} empreendimento{developments.length !== 1 ? "s" : ""}
          </p>
          {canManage && (
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo empreendimento
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : developments.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <LandPlot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Nenhum empreendimento cadastrado.</p>
            {canManage && (
              <Button type="button" className="mt-4" onClick={openCreate}>
                Criar primeiro empreendimento
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {developments.map((dev) => (
              <article key={dev.id} className={card}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{dev.name}</h2>
                    {(dev.city || dev.state) && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[dev.city, dev.state].filter(Boolean).join(" / ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">{dev.status === "active" ? "Ativo" : "Inativo"}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-500/10 px-2 py-2">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400">{dev.counts.available}</div>
                    <div className="text-muted-foreground">Disp.</div>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 px-2 py-2">
                    <div className="font-semibold text-amber-700 dark:text-amber-400">{dev.counts.reserved}</div>
                    <div className="text-muted-foreground">Res.</div>
                  </div>
                  <div className="rounded-lg bg-slate-500/10 px-2 py-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-400">{dev.counts.sold}</div>
                    <div className="text-muted-foreground">Vend.</div>
                  </div>
                  <div className="rounded-lg bg-muted px-2 py-2">
                    <div className="font-semibold">{dev.counts.total}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" asChild>
                    <Link to={`${basePath}/empreendimentos/${dev.id}`}>Abrir mapa</Link>
                  </Button>
                  {canManage && (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => openEdit(dev)}>
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(dev)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {selectedTenantId && (
        <DevelopmentFormDialog
          tenantId={selectedTenantId}
          development={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empreendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os lotes de &quot;{deleteTarget?.name}&quot; serão excluídos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
