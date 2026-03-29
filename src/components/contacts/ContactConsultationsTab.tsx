import { useState } from "react";
import { Plus, Stethoscope, Edit2, AlertCircle, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useContactAppointments, useCreateContactAppointment } from "@/hooks/useContacts";
import { useUpdateCalendarEvent } from "@/hooks/useCalendarEvents";
import { useCalendars } from "@/hooks/useCalendars";
import { toast } from "sonner";
import type { CalendarEvent, EventProcedureMetadata } from "@/types/calendar";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface Props {
  contactId: string;
  tenantId: string | undefined;
}

interface EditingConsultation {
  event: CalendarEvent;
  metadata: EventProcedureMetadata;
}

export function ContactConsultationsTab({ contactId, tenantId }: Props) {
  const [showNewConsultation, setShowNewConsultation] = useState(false);
  const [editingConsultation, setEditingConsultation] = useState<EditingConsultation | null>(null);

  const { data: allAppointments, isLoading } = useContactAppointments(contactId, false);
  const { data: calendars } = useCalendars(tenantId);
  const createAppointment = useCreateContactAppointment(contactId);
  const updateEvent = useUpdateCalendarEvent();

  // Filter past consultations
  const consultations = (allAppointments ?? [])
    .filter((e) => new Date(e.start_at) < new Date())
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

  // New consultation form state
  const [newForm, setNewForm] = useState({
    title: "Consulta",
    description: "",
    calendar_id: "",
    procedure_type: "consulta",
    professional_name: "",
    patient_notes: "",
    session_number: "",
    start_at: "",
    color: "#3B82F6",
  });

  // Edit consultation form state
  const [editForm, setEditForm] = useState({
    procedure_type: "",
    professional_name: "",
    patient_notes: "",
    session_number: "",
  });

  const handleCreateConsultation = () => {
    if (!newForm.start_at || !newForm.calendar_id) {
      toast.error("Data/hora e calendário são obrigatórios");
      return;
    }

    const metadata: EventProcedureMetadata = {
      procedure_type: newForm.procedure_type || undefined,
      professional_name: newForm.professional_name || undefined,
      patient_notes: newForm.patient_notes || undefined,
      session_number: newForm.session_number ? parseInt(newForm.session_number) : undefined,
    };

    createAppointment.mutate(
      {
        title: newForm.title.trim(),
        description: newForm.description || null,
        start_at: newForm.start_at,
        end_at: null,
        color: newForm.color,
        calendar_id: newForm.calendar_id,
        metadata,
      },
      {
        onSuccess: () => {
          toast.success("Consulta registrada");
          setShowNewConsultation(false);
          setNewForm({
            title: "Consulta",
            description: "",
            calendar_id: "",
            procedure_type: "consulta",
            professional_name: "",
            patient_notes: "",
            session_number: "",
            start_at: "",
            color: "#3B82F6",
          });
        },
        onError: () => toast.error("Erro ao registrar consulta"),
      }
    );
  };

  const handleSaveEditConsultation = () => {
    if (!editingConsultation) return;

    const metadata: EventProcedureMetadata = {
      procedure_type: editForm.procedure_type || undefined,
      professional_name: editForm.professional_name || undefined,
      patient_notes: editForm.patient_notes || undefined,
      session_number: editForm.session_number ? parseInt(editForm.session_number) : undefined,
    };

    updateEvent.mutate(
      {
        id: editingConsultation.event.id,
        metadata,
        updated_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success("Anotações atualizadas");
          setEditingConsultation(null);
        },
        onError: () => toast.error("Erro ao atualizar anotações"),
      }
    );
  };

  const openEditDialog = (event: CalendarEvent) => {
    const m = (event.metadata as EventProcedureMetadata) || {};
    setEditForm({
      procedure_type: m.procedure_type || "",
      professional_name: m.professional_name || "",
      patient_notes: m.patient_notes || "",
      session_number: m.session_number ? String(m.session_number) : "",
    });
    setEditingConsultation({ event, metadata: m });
  };

  // Set default date to today, midnight
  const handleOpenNewConsultation = () => {
    const today = new Date();
    today.setHours(14, 0, 0, 0);
    const iso = today.toISOString().slice(0, 16);
    setNewForm((f) => ({ ...f, start_at: iso }));
    setShowNewConsultation(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Histórico de Consultas</h3>
        <Button size="sm" onClick={handleOpenNewConsultation}>
          <Plus className="h-4 w-4 mr-1" /> Registrar Consulta
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : consultations && consultations.length > 0 ? (
        <div className="space-y-3">
          {consultations.map((event) => {
            const m = (event.metadata as EventProcedureMetadata) || {};
            return (
              <div
                key={event.id}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="mt-1 h-3 w-3 rounded-full shrink-0 ring-2 ring-background"
                      style={{ backgroundColor: event.color || "#3B82F6" }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {formatDateTime(event.start_at)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    title="Editar anotações"
                    onClick={() => openEditDialog(event)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-2 pl-6">
                  {m.professional_name && (
                    <div className="flex items-center gap-2 text-xs">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        Profissional: <span className="font-medium text-foreground">{m.professional_name}</span>
                      </span>
                    </div>
                  )}

                  {m.procedure_type && (
                    <div className="flex items-center gap-2 text-xs">
                      <Stethoscope className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">
                        Tipo: <span className="font-medium text-foreground">{m.procedure_type}</span>
                      </span>
                    </div>
                  )}

                  {m.session_number && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">
                        Sessão: <span className="font-medium text-foreground">#{m.session_number}</span>
                      </span>
                    </div>
                  )}

                  {m.patient_notes && (
                    <div className="mt-2 p-2 rounded bg-muted/40 border border-border/50">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Anotações:</p>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{m.patient_notes}</p>
                    </div>
                  )}

                  {!m.professional_name && !m.procedure_type && !m.session_number && !m.patient_notes && (
                    <p className="text-xs text-muted-foreground italic">Nenhuma anotação registrada</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <Stethoscope className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma consulta registrada</p>
          <Button variant="outline" size="sm" onClick={handleOpenNewConsultation}>
            <Plus className="h-4 w-4 mr-1" /> Registrar Consulta
          </Button>
        </div>
      )}

      {/* Dialog: Registrar Consulta */}
      <Dialog open={showNewConsultation} onOpenChange={setShowNewConsultation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Consulta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Calendário / Profissional *</Label>
              <Select
                value={newForm.calendar_id}
                onValueChange={(v) => setNewForm((f) => ({ ...f, calendar_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar profissional" />
                </SelectTrigger>
                <SelectContent>
                  {(calendars ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Data/Hora *</Label>
              <Input
                type="datetime-local"
                value={newForm.start_at}
                onChange={(e) => setNewForm((f) => ({ ...f, start_at: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Procedimento</Label>
              <Input
                placeholder="Ex: Consulta, Limpeza, Tratamento"
                value={newForm.procedure_type}
                onChange={(e) => setNewForm((f) => ({ ...f, procedure_type: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Profissional</Label>
              <Input
                placeholder="Nome do dentista/profissional"
                value={newForm.professional_name}
                onChange={(e) => setNewForm((f) => ({ ...f, professional_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Número da Sessão</Label>
              <Input
                type="number"
                min="1"
                placeholder="Ex: 1, 2, 3..."
                value={newForm.session_number}
                onChange={(e) => setNewForm((f) => ({ ...f, session_number: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Anotações Clínicas</Label>
              <Textarea
                rows={4}
                placeholder="Detalhes da consulta, procedimentos realizados, observações..."
                value={newForm.patient_notes}
                onChange={(e) => setNewForm((f) => ({ ...f, patient_notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewConsultation(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateConsultation} disabled={createAppointment.isPending}>
              Registrar Consulta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Anotações */}
      <Dialog open={!!editingConsultation} onOpenChange={(v) => !v && setEditingConsultation(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Anotações</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded bg-muted/40 border border-border/50">
              <p className="text-xs text-muted-foreground font-medium mb-1">Consulta:</p>
              <p className="text-sm font-medium">{editingConsultation?.event.title}</p>
              <p className="text-xs text-muted-foreground">
                {editingConsultation?.event.start_at
                  ? formatDateTime(editingConsultation.event.start_at)
                  : ""}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Procedimento</Label>
              <Input
                placeholder="Ex: Consulta, Limpeza, Tratamento"
                value={editForm.procedure_type}
                onChange={(e) => setEditForm((f) => ({ ...f, procedure_type: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Profissional</Label>
              <Input
                placeholder="Nome do dentista/profissional"
                value={editForm.professional_name}
                onChange={(e) => setEditForm((f) => ({ ...f, professional_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Número da Sessão</Label>
              <Input
                type="number"
                min="1"
                placeholder="Ex: 1, 2, 3..."
                value={editForm.session_number}
                onChange={(e) => setEditForm((f) => ({ ...f, session_number: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Anotações Clínicas</Label>
              <Textarea
                rows={4}
                placeholder="Detalhes da consulta, procedimentos realizados, observações..."
                value={editForm.patient_notes}
                onChange={(e) => setEditForm((f) => ({ ...f, patient_notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConsultation(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEditConsultation} disabled={updateEvent.isPending}>
              Salvar Anotações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
