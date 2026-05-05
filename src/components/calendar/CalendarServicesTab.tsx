import { useState } from "react";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  useCalendarServices,
  useCreateCalendarService,
  useUpdateCalendarService,
  useDeleteCalendarService,
  type CalendarService,
} from "@/hooks/useCalendarServices";

interface Props {
  tenantId: string | null | undefined;
}

interface ServiceForm {
  name: string;
  duration_minutes: number;
  description: string;
}

const emptyForm: ServiceForm = { name: "", duration_minutes: 60, description: "" };

export function CalendarServicesTab({ tenantId }: Props) {
  const { data: services = [], isLoading } = useCalendarServices(tenantId);
  const createService = useCreateCalendarService();
  const updateService = useUpdateCalendarService();
  const deleteService = useDeleteCalendarService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<CalendarService | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<CalendarService | null>(null);

  const openCreate = () => {
    setEditingService(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (svc: CalendarService) => {
    setEditingService(svc);
    setForm({
      name: svc.name,
      duration_minutes: svc.duration_minutes,
      description: svc.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Nome do serviço é obrigatório");
      return;
    }
    if (!form.duration_minutes || form.duration_minutes <= 0) {
      toast.error("Duração deve ser maior que zero");
      return;
    }

    if (editingService) {
      updateService.mutate(
        {
          id: editingService.id,
          name: form.name.trim(),
          duration_minutes: form.duration_minutes,
          description: form.description.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success("Serviço atualizado");
            setDialogOpen(false);
          },
          onError: () => toast.error("Erro ao atualizar serviço"),
        }
      );
    } else {
      if (!tenantId) return;
      createService.mutate(
        {
          tenant_id: tenantId,
          name: form.name.trim(),
          duration_minutes: form.duration_minutes,
          description: form.description.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success("Serviço criado");
            setDialogOpen(false);
          },
          onError: () => toast.error("Erro ao criar serviço"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteTarget || !tenantId) return;
    deleteService.mutate(
      { id: deleteTarget.id, tenantId },
      {
        onSuccess: () => {
          toast.success("Serviço removido");
          setDeleteTarget(null);
        },
        onError: () => toast.error("Erro ao remover serviço"),
      }
    );
  };

  const activeServices = services.filter((s) => s.active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Serviços</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tipos de serviço que a empresa oferece. O agente usa esses dados ao agendar consultas.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Adicionar
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Carregando...</div>
      ) : activeServices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione os serviços que sua empresa oferece para o agente usar nos agendamentos.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar serviço
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {activeServices.map((svc) => (
            <div key={svc.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{svc.name}</p>
                {svc.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{svc.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  {svc.duration_minutes} min
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(svc)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(svc)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Nome</Label>
              <Input
                id="svc-name"
                placeholder="Ex: Limpeza, Consulta, Implante"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-duration">Duração (minutos)</Label>
              <Input
                id="svc-duration"
                type="number"
                min={5}
                step={5}
                placeholder="60"
                value={form.duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Descrição (opcional)</Label>
              <Textarea
                id="svc-desc"
                placeholder="Informações adicionais sobre o serviço"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={createService.isPending || updateService.isPending}
            >
              {editingService ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço <strong>{deleteTarget?.name}</strong> será removido da lista.
              Agendamentos existentes não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
