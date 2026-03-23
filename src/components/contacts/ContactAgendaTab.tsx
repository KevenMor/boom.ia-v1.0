import { useState } from "react";
import { Plus, CalendarDays, ExternalLink, Unlink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useContactAppointments, useCreateContactAppointment, useUnlinkContactAppointment } from "@/hooks/useContacts";
import { useCalendars } from "@/hooks/useCalendars";
import { toast } from "sonner";
import type { CalendarEvent } from "@/types/calendar";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  contactId: string;
  tenantId: string | undefined;
}

export function ContactAgendaTab({ contactId, tenantId }: Props) {
  const [upcoming, setUpcoming] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<CalendarEvent | null>(null);

  const { data: appointments, isLoading } = useContactAppointments(contactId, upcoming);
  const { data: calendars } = useCalendars(tenantId);
  const createAppointment = useCreateContactAppointment(contactId);
  const unlinkAppointment = useUnlinkContactAppointment(contactId);

  // form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_at: "",
    end_at: "",
    color: "#3B82F6",
    calendar_id: "",
  });

  const handleCreate = () => {
    if (!form.title.trim() || !form.start_at || !form.calendar_id) {
      toast.error("Título, data/hora de início e calendário são obrigatórios");
      return;
    }
    createAppointment.mutate(
      {
        title: form.title.trim(),
        description: form.description || null,
        start_at: form.start_at,
        end_at: form.end_at || null,
        color: form.color,
        calendar_id: form.calendar_id,
      },
      {
        onSuccess: () => {
          toast.success("Agendamento criado");
          setShowNew(false);
          setForm({ title: "", description: "", start_at: "", end_at: "", color: "#3B82F6", calendar_id: "" });
        },
        onError: () => toast.error("Erro ao criar agendamento"),
      }
    );
  };

  const handleUnlink = () => {
    if (!unlinkTarget) return;
    unlinkAppointment.mutate(unlinkTarget.id, {
      onSuccess: () => { toast.success("Agendamento desvinculado"); setUnlinkTarget(null); },
      onError: () => toast.error("Erro ao desvincular"),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          <button
            onClick={() => setUpcoming(true)}
            className={`px-3 py-1.5 transition-colors ${upcoming ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Próximos
          </button>
          <button
            onClick={() => setUpcoming(false)}
            className={`px-3 py-1.5 transition-colors ${!upcoming ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            Todos
          </button>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : appointments && appointments.length > 0 ? (
        <div className="space-y-3">
          {appointments.map((event) => (
            <div key={event.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="mt-0.5 h-3 w-3 rounded-full shrink-0 ring-2 ring-background"
                  style={{ backgroundColor: event.color || "#3B82F6" }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.start_at)}</p>
                    {event.end_at && (
                      <p className="text-xs text-muted-foreground">— {formatDateTime(event.end_at)}</p>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{event.description}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                title="Desvincular agendamento"
                onClick={() => setUnlinkTarget(event)}
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <CalendarDays className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            {upcoming ? "Nenhum agendamento futuro vinculado" : "Nenhum agendamento vinculado"}
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
          </Button>
        </div>
      )}

      {/* Dialog: Novo Agendamento */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Calendário *</Label>
              <Select value={form.calendar_id} onValueChange={(v) => setForm((f) => ({ ...f, calendar_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar calendário" />
                </SelectTrigger>
                <SelectContent>
                  {(calendars ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Consulta, Aula, Procedimento"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Término</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                placeholder="Observações"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded border border-border bg-background p-1"
                />
                <span className="text-xs text-muted-foreground">{form.color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createAppointment.isPending}>
              Criar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert: Desvincular */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(v) => !v && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O agendamento <strong>{unlinkTarget?.title}</strong> será desvinculado deste cliente, mas continuará existindo no calendário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlink}>Desvincular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
