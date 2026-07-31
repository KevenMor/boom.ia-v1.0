import { useState, useMemo } from "react";
import { Plus, CalendarDays, ExternalLink, Unlink, Clock, Calendar, ChevronRight } from "lucide-react";
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
import { useContactAppointments, useCreateContactAppointment, useUnlinkContactAppointment, useContactCalendars } from "@/hooks/useContacts";
import { toast } from "sonner";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { CalendarEvent, EventProcedureMetadata } from "@/types/calendar";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

interface Props {
  contactId: string;
  tenantId: string | undefined;
}

export function ContactAgendaTab({ contactId, tenantId }: Props) {
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [upcoming, setUpcoming] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");
  const [unlinkTarget, setUnlinkTarget] = useState<CalendarEvent | null>(null);

  const { data: appointments, isLoading } = useContactAppointments(contactId, false);
  const { data: calendars } = useContactCalendars(contactId);
  const createAppointment = useCreateContactAppointment(contactId);
  const unlinkAppointment = useUnlinkContactAppointment(contactId);

  // Filter appointments by view (upcoming/all)
  const filteredAppointments = useMemo(() => {
    if (!appointments) return [];
    const now = new Date();
    if (upcoming) {
      return appointments.filter((a) => new Date(a.start_at) >= now);
    }
    return appointments;
  }, [appointments, upcoming]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!appointments) return { total: 0, lastDate: null, nextDate: null };
    const now = new Date();
    const pastAppointments = appointments.filter((a) => new Date(a.start_at) < now);
    const futureAppointments = appointments.filter((a) => new Date(a.start_at) >= now);

    return {
      total: appointments.length,
      lastDate:
        pastAppointments.length > 0
          ? new Date(pastAppointments[pastAppointments.length - 1].start_at)
          : null,
      nextDate:
        futureAppointments.length > 0
          ? new Date(futureAppointments[0].start_at)
          : null,
    };
  }, [appointments]);

  // Form state
  const [form, setForm] = useState({
    title: "Agendamento",
    description: "",
    start_at: "",
    end_at: "",
    color: "#3B82F6",
    calendar_id: "",
    procedure_type: "",
    professional_name: "",
    patient_notes: "",
  });

  const handleCreate = () => {
    if (!form.title.trim() || !form.start_at || !form.calendar_id) {
      toast.error("Título, data/hora e profissional são obrigatórios");
      return;
    }

    const metadata: EventProcedureMetadata = {
      procedure_type: form.procedure_type || undefined,
      professional_name: form.professional_name || undefined,
      patient_notes: form.patient_notes || undefined,
    };

    createAppointment.mutate(
      {
        title: form.title.trim(),
        description: form.description || null,
        start_at: form.start_at,
        end_at: form.end_at || null,
        color: form.color,
        calendar_id: form.calendar_id,
        metadata,
      },
      {
        onSuccess: () => {
          toast.success("Agendamento criado");
          setShowNew(false);
          setForm({
            title: "Agendamento",
            description: "",
            start_at: "",
            end_at: "",
            color: "#3B82F6",
            calendar_id: "",
            procedure_type: "",
            professional_name: "",
            patient_notes: "",
          });
        },
        onError: () => toast.error("Erro ao criar agendamento"),
      }
    );
  };

  const handleUnlink = () => {
    if (!unlinkTarget) return;
    unlinkAppointment.mutate(unlinkTarget.id, {
      onSuccess: () => {
        toast.success("Agendamento desvinculado");
        setUnlinkTarget(null);
      },
      onError: () => toast.error("Erro ao desvincular"),
    });
  };

  const handleDateSelect = (selectInfo: any) => {
    const date = new Date(selectInfo.startStr);
    date.setHours(14, 0, 0, 0);
    const iso = date.toISOString().slice(0, 16);
    setForm((f) => ({ ...f, start_at: iso }));
    setShowNew(true);
  };

  const calendarEvents = (appointments ?? [])
    .filter((e) => !selectedCalendarId || e.calendar_id === selectedCalendarId)
    .map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start_at,
      end: e.end_at || undefined,
      backgroundColor: e.color,
      borderColor: e.color,
    }));

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total de Consultas</p>
            <p className="text-lg font-semibold">{summaryStats.total}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Última Consulta</p>
            <p className="text-sm font-semibold">
              {summaryStats.lastDate ? formatDate(summaryStats.lastDate.toISOString()) : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Próxima Consulta</p>
            <p className="text-sm font-semibold">
              {summaryStats.nextDate ? formatDate(summaryStats.nextDate.toISOString()) : "—"}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <Clock className="h-4 w-4" />
              Lista
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 transition-colors flex items-center gap-1 ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Calendário
            </button>
          </div>
          {viewMode === "list" && (
            <div className="flex rounded-md border border-border overflow-hidden text-sm">
              <button
                onClick={() => setUpcoming(true)}
                className={`px-3 py-1.5 transition-colors ${
                  upcoming ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
              >
                Próximos
              </button>
              <button
                onClick={() => setUpcoming(false)}
                className={`px-3 py-1.5 transition-colors ${
                  !upcoming ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                }`}
              >
                Todos
              </button>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Agendamento
        </Button>
      </div>

      {viewMode === "list" ? (
        <>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : filteredAppointments && filteredAppointments.length > 0 ? (
            <div className="space-y-3">
              {filteredAppointments
                .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
                .map((event) => {
                  const m = (event.metadata as EventProcedureMetadata) || {};
                  return (
                    <div
                      key={event.id}
                      className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="mt-0.5 h-3 w-3 rounded-full shrink-0 ring-2 ring-background"
                          style={{ backgroundColor: event.color || "#3B82F6" }}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(event.start_at)}
                            </p>
                            {event.end_at && (
                              <p className="text-xs text-muted-foreground">
                                — {formatDateTime(event.end_at)}
                              </p>
                            )}
                          </div>
                          {m.professional_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Profissional: {m.professional_name}
                            </p>
                          )}
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {event.description}
                            </p>
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
                  );
                })}
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
        </>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Filtrar por Profissional / Agenda</Label>
            <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
              <SelectTrigger>
                <SelectValue placeholder="Mostrar todas as agendas" />
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
          <div className="rounded-lg border border-border bg-card p-4 overflow-hidden">
            <style>{`
              .contact-agenda-fc .fc-event-main { padding: 2px 4px; font-size: 0.75rem; }
            `}</style>
            <div className="contact-agenda-fc">
            <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={ptBrLocale}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={calendarEvents}
            selectable={true}
            select={handleDateSelect}
            height="auto"
            contentHeight="auto"
          />
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Novo Agendamento */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Profissional / Agenda *</Label>
              <Select value={form.calendar_id} onValueChange={(v) => setForm((f) => ({ ...f, calendar_id: v }))}>
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
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Consulta, Procedimento"
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
              <Label>Tipo de Procedimento</Label>
              <Input
                placeholder="Ex: Consulta, Limpeza, Tratamento"
                value={form.procedure_type}
                onChange={(e) => setForm((f) => ({ ...f, procedure_type: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Profissional</Label>
              <Input
                placeholder="Nome do profissional"
                value={form.professional_name}
                onChange={(e) => setForm((f) => ({ ...f, professional_name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Anotações</Label>
              <Textarea
                rows={2}
                placeholder="Observações ou detalhes da consulta"
                value={form.patient_notes}
                onChange={(e) => setForm((f) => ({ ...f, patient_notes: e.target.value }))}
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
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
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
