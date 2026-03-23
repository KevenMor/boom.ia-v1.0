import { useState } from "react";
import { Pencil, Trash2, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { ContactPackage, ContactPackageStatus } from "@/types/database";
import { useUpdateContactPackage, useDeleteContactPackage } from "@/hooks/useContacts";
import { toast } from "sonner";

const statusConfig: Record<ContactPackageStatus, { label: string; className: string }> = {
  active:    { label: "Ativo",      className: "bg-emerald-500/15 text-emerald-600 border-emerald-200" },
  paused:    { label: "Pausado",    className: "bg-amber-500/15 text-amber-600 border-amber-200" },
  completed: { label: "Concluído",  className: "bg-slate-500/15 text-slate-600 border-slate-200" },
  cancelled: { label: "Cancelado",  className: "bg-red-500/15 text-red-600 border-red-200" },
};

function formatBRL(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

interface Props {
  pkg: ContactPackage;
  contactId: string;
  onEdit?: (pkg: ContactPackage) => void;
}

export function PackageCard({ pkg, contactId, onEdit }: Props) {
  const [showDelete, setShowDelete] = useState(false);
  const updatePkg = useUpdateContactPackage(contactId);
  const deletePkg = useDeleteContactPackage(contactId);

  const cfg = statusConfig[pkg.status] ?? statusConfig.active;
  const hasProgress = pkg.sessions_total != null && pkg.sessions_total > 0;
  const progress = hasProgress ? Math.min(1, pkg.sessions_used / pkg.sessions_total!) : 0;

  const handleStatusChange = (newStatus: ContactPackageStatus) => {
    updatePkg.mutate(
      { packageId: pkg.id, status: newStatus },
      { onError: () => toast.error("Erro ao atualizar status") }
    );
  };

  const handleDelete = () => {
    deletePkg.mutate(pkg.id, {
      onSuccess: () => toast.success("Pacote removido"),
      onError: () => toast.error("Erro ao remover pacote"),
    });
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight truncate">{pkg.name}</p>
            {pkg.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pkg.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Badge className={`cursor-pointer select-none text-xs border ${cfg.className} flex items-center gap-1`}>
                  {cfg.label} <ChevronDown className="h-2.5 w-2.5" />
                </Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(statusConfig) as ContactPackageStatus[]).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)} disabled={s === pkg.status}>
                    {statusConfig[s].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {hasProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Sessões</span>
              <span>{pkg.sessions_used} / {pkg.sessions_total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {formatBRL(pkg.price) && (
              <span className="font-medium text-foreground">{formatBRL(pkg.price)}</span>
            )}
            {(pkg.start_date || pkg.end_date) && (
              <span>
                {formatDate(pkg.start_date) ?? "?"} — {formatDate(pkg.end_date) ?? "?"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(pkg)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pacote?</AlertDialogTitle>
            <AlertDialogDescription>
              O pacote <strong>{pkg.name}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
