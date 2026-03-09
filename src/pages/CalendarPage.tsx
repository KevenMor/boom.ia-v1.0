import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventInput, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Clock, CalendarDays, Bell, Phone } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenants } from "@/hooks/useTenants";
import { useCalendars, useCreateCalendar } from "@/hooks/useCalendars";
import { useCalendarEvents, useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent } from "@/hooks/useCalendarEvents";
import { useAgents } from "@/hooks/useAgents";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import type { Calendar } from "@/types/calendar";

const EVENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  primary: { bg: "hsl(262 72% 62%)", border: "hsl(262 72% 62%)", label: "Padrão" },
  success: { bg: "hsl(158 60% 44%)", border: "hsl(158 60% 44%)", label: "Sucesso" },
  warning: { bg: "hsl(38 80% 55%)", border: "hsl(38 80% 55%)", label: "Aviso" },
  destructive: { bg: "hsl(0 68% 55%)", border: "hsl(0 68% 55%)", label: "Urgente" },
  accent: { bg: "hsl(210 60% 50%)", border: "hsl(210 60% 50%)", label: "Destaque" },
};

function formatDateTimeBR(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function extractTime(dateStr: string): string {
  if (!dateStr) return "08:00";
  if (dateStr.includes("T")) {
    const timePart = dateStr.split("T")[1];
    return timePart ? timePart.substring(0, 5) : "08:00";
  }
  return "08:00";
}

function extractDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  return dateStr.split("T")[0];
}

function normalizePhoneForReminder(raw: string): string {
  let phone = raw.replace(/\D/g, "");
  if (!phone.startsWith("55")) phone = `55${phone}`;
  return phone;
}

function displayPhoneFromReminder(raw: string | null | undefined): string {
  const phone = (raw || "").replace(/\D/g, "");
  if (phone.startsWith("55") && phone.length >= 12) return phone.slice(2);
  return phone;
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const { selectedTenantId: globalTenantId } = useTenantContext();

  // Tenant & calendar selection — use global tenant when set
  const { data: tenants } = useTenants();
  const [localTenantId, setLocalTenantId] = useState<string>("");
  const selectedTenantId = globalTenantId || localTenantId;
  const { data: calendars, isLoading: calendarsLoading } = useCalendars(selectedTenantId || undefined);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("all");

  const activeCalendarIds = useMemo(() => {
    if (!calendars) return [];
    if (selectedCalendarId === "all") return calendars.filter(c => c.is_active).map(c => c.id);
    return [selectedCalendarId];
  }, [calendars, selectedCalendarId]);

  const { data: dbEvents, isLoading: eventsLoading } = useCalendarEvents(selectedTenantId || undefined, activeCalendarIds);
  const { data: agents, refetch: refetchAgents } = useAgents(selectedTenantId || undefined);
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const createCalendar = useCreateCalendar();

  // Map DB events to FullCalendar format
  const events: EventInput[] = useMemo(() => {
    if (!dbEvents) return [];
    return dbEvents.map((ev) => {
      const colorDef = EVENT_COLORS[ev.color] || EVENT_COLORS.primary;
      return {
        id: ev.id,
        title: ev.title,
        start: ev.start_at,
        end: ev.end_at || undefined,
        allDay: ev.all_day,
        backgroundColor: colorDef.bg,
        borderColor: colorDef.border,
        extendedProps: { color: ev.color, calendarId: ev.calendar_id, dbEvent: ev },
      };
    });
  }, [dbEvents]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEventClick, setSelectedEventClick] = useState<EventClickArg | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState("primary");
  const [eventCalendarId, setEventCalendarId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);
  const [sendReminder, setSendReminder] = useState(false);
  const [reminderPhone, setReminderPhone] = useState("");
  const [reminderAgentId, setReminderAgentId] = useState("");

  // Refetch agents ao abrir o modal (para pegar config atualizado apos editar agente)
  useEffect(() => {
    if (dialogOpen) refetchAgents();
  }, [dialogOpen, refetchAgents]);

  // Agents with reminders enabled (active ou test, com reminder_enabled no config)
  const reminderAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a => {
      const cfg = (a.config || {}) as Record<string, unknown>;
      const enabled = cfg.reminder_enabled === true || cfg.reminder_enabled === "true";
      return (a.status === "active" || a.status === "test") && enabled;
    });
  }, [agents]);

  // New calendar dialog
  const [newCalDialogOpen, setNewCalDialogOpen] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [newCalColor, setNewCalColor] = useState("primary");

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (!selectedTenantId || !calendars?.length) {
      toast.error("Selecione um tenant e crie uma agenda primeiro.");
      return;
    }
    setSelectedEventClick(null);
    setEditingEventId(null);
    setNewTitle("");
    setNewColor("primary");
    setEventCalendarId(selectedCalendarId === "all" ? calendars[0].id : selectedCalendarId);
    setAllDay(info.allDay);
    setStartDate(extractDate(info.startStr));
    setStartTime(info.allDay ? "08:00" : extractTime(info.startStr));
    setEndDate(extractDate(info.endStr));
    setEndTime(info.allDay ? "09:00" : extractTime(info.endStr));
    setSendReminder(false);
    setReminderPhone("");
    setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    setDialogOpen(true);
  }, [selectedTenantId, calendars, selectedCalendarId, reminderAgents]);

  const handleEventClick = useCallback(async (info: EventClickArg) => {
    const ep = info.event.extendedProps;
    setSelectedEventClick(info);
    setEditingEventId(info.event.id);
    setNewTitle(info.event.title);
    setNewColor(ep.color || "primary");
    setEventCalendarId(ep.calendarId || "");
    setAllDay(info.event.allDay);
    setStartDate(extractDate(info.event.startStr));
    setStartTime(info.event.allDay ? "08:00" : extractTime(info.event.startStr));
    setEndDate(extractDate(info.event.endStr || info.event.startStr));
    setEndTime(info.event.allDay ? "09:00" : extractTime(info.event.endStr || info.event.startStr));

    if (selectedTenantId) {
      const { data: reminder, error } = await supabase
        .from("appointment_reminders")
        .select("agent_id, external_user_id, status")
        .eq("tenant_id", selectedTenantId)
        .eq("calendar_event_id", info.event.id)
        .eq("conversation_id", `manual-${info.event.id}`)
        .in("status", ["pending", "sent"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error loading reminder:", error);
      }

      if (reminder) {
        setSendReminder(true);
        setReminderPhone(displayPhoneFromReminder(reminder.external_user_id));
        setReminderAgentId(reminder.agent_id);
      } else {
        setSendReminder(false);
        setReminderPhone("");
        setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
      }
    } else {
      setSendReminder(false);
      setReminderPhone("");
      setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    }

    setDialogOpen(true);
  }, [reminderAgents, selectedTenantId]);

  const handleSave = async () => {
    if (!newTitle.trim() || !selectedTenantId || !eventCalendarId) return;
    if (sendReminder && !reminderPhone.trim()) {
      toast.error("Informe o WhatsApp do cliente para enviar lembrete.");
      return;
    }
    if (sendReminder && !reminderAgentId) {
      toast.error("Selecione o agente para enviar o lembrete.");
      return;
    }
    const finalStart = allDay ? `${startDate}T00:00:00` : `${startDate}T${startTime}:00`;
    const finalEnd = allDay ? `${endDate}T23:59:59` : `${endDate}T${endTime}:00`;

    try {
      let eventId = editingEventId;
      if (editingEventId) {
        await updateEvent.mutateAsync({
          id: editingEventId,
          title: newTitle,
          start_at: finalStart,
          end_at: finalEnd,
          all_day: allDay,
          color: newColor,
          calendar_id: eventCalendarId,
          tenant_id: selectedTenantId,
        });
        toast.success("Evento atualizado!");
      } else {
        const created = await createEvent.mutateAsync({
          title: newTitle,
          start_at: finalStart,
          end_at: finalEnd,
          all_day: allDay,
          color: newColor,
          calendar_id: eventCalendarId,
          tenant_id: selectedTenantId,
        });
        eventId = created.id;
        toast.success("Evento criado!");
      }

      // Upsert/cancel manual reminder linked to this event
      if (eventId) {
        const conversationId = `manual-${eventId}`;

        if (sendReminder && reminderAgentId) {
          const agent = reminderAgents.find(a => a.id === reminderAgentId);
          const cfg = (agent?.config || {}) as Record<string, any>;
          const minutesBefore = cfg.reminder_minutes_before || 60;
          const eventStartDate = new Date(finalStart);
          const remindAt = new Date(eventStartDate.getTime() - minutesBefore * 60 * 1000);
          const phone = normalizePhoneForReminder(reminderPhone);

          const { data: existingReminder, error: existingErr } = await supabase
            .from("appointment_reminders")
            .select("id")
            .eq("tenant_id", selectedTenantId)
            .eq("calendar_event_id", eventId)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingErr) {
            console.error("Reminder load error:", existingErr);
            toast.error("Evento salvo, mas erro ao carregar lembrete existente.");
          } else if (existingReminder?.id) {
            const { error: remUpdateErr } = await supabase
              .from("appointment_reminders")
              .update({
                agent_id: reminderAgentId,
                external_user_id: phone,
                event_title: newTitle,
                event_start_at: finalStart,
                remind_at: remindAt.toISOString(),
                status: "pending",
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingReminder.id);

            if (remUpdateErr) {
              console.error("Reminder update error:", remUpdateErr);
              toast.error("Evento salvo, mas erro ao atualizar lembrete.");
            } else {
              toast.success("Lembrete atualizado! 🔔");
            }
          } else {
            const { error: remInsertErr } = await supabase
              .from("appointment_reminders")
              .insert({
                agent_id: reminderAgentId,
                tenant_id: selectedTenantId,
                calendar_event_id: eventId,
                conversation_id: conversationId,
                external_user_id: phone,
                event_title: newTitle,
                event_start_at: finalStart,
                remind_at: remindAt.toISOString(),
                status: "pending",
              });

            if (remInsertErr) {
              console.error("Reminder insert error:", remInsertErr);
              toast.error("Evento salvo, mas erro ao agendar lembrete.");
            } else {
              toast.success("Lembrete agendado! 🔔");
            }
          }
        } else if (editingEventId) {
          const { error: remCancelErr } = await supabase
            .from("appointment_reminders")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("tenant_id", selectedTenantId)
            .eq("calendar_event_id", eventId)
            .eq("conversation_id", conversationId)
            .neq("status", "cancelled");

          if (remCancelErr) {
            console.error("Reminder cancel error:", remCancelErr);
            toast.error("Evento salvo, mas erro ao cancelar lembrete.");
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar evento.");
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!editingEventId || !selectedTenantId) return;
    try {
      await deleteEvent.mutateAsync({ id: editingEventId, tenantId: selectedTenantId });
      toast.success("Evento excluído!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir.");
    }
    setDialogOpen(false);
  };

  const handleCreateCalendar = async () => {
    if (!newCalName.trim() || !selectedTenantId) return;
    try {
      await createCalendar.mutateAsync({
        tenant_id: selectedTenantId,
        name: newCalName,
        color: newCalColor,
      });
      toast.success("Agenda criada!");
      setNewCalDialogOpen(false);
      setNewCalName("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar agenda.");
    }
  };

  const dialogDateLabel = useMemo(() => {
    const s = `${startDate}T${startTime}`;
    const e = `${endDate}T${endTime}`;
    if (allDay) {
      return new Date(startDate).toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
      });
    }
    return `${formatDateTimeBR(s)} — ${formatDateTimeBR(e)}`;
  }, [startDate, startTime, endDate, endTime, allDay]);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Calendar */}
      <div className="xl:col-span-9 col-span-12 space-y-4">
        {/* Tenant & Calendar filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 py-4">
            {!globalTenantId && (
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Tenant</Label>
                <Select value={localTenantId} onValueChange={(v) => { setLocalTenantId(v); setSelectedCalendarId("all"); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tenant" /></SelectTrigger>
                  <SelectContent>
                    {tenants?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {globalTenantId && (
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Tenant</Label>
                <p className="text-sm font-medium py-2">{tenants?.find(t => t.id === globalTenantId)?.name || "—"}</p>
              </div>
            )}
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Agenda</Label>
              <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId} disabled={!selectedTenantId}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as agendas</SelectItem>
                  {calendars?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_COLORS[c.color]?.bg || EVENT_COLORS.primary.bg }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" disabled={!selectedTenantId} onClick={() => setNewCalDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Agenda
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Agenda</CardTitle>
          </CardHeader>
          <CardContent className="calendar-wrapper">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }}
              locale={ptBrLocale}
              timeZone="America/Sao_Paulo"
              selectable={!!selectedTenantId}
              selectMirror
              editable
              dayMaxEvents
              events={events}
              select={handleDateSelect}
              eventClick={handleEventClick}
              height="auto"
              slotMinTime="06:00:00"
              slotMaxTime="23:00:00"
              slotDuration="00:30:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              nowIndicator
              allDayText="Dia todo"
              buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia", list: "Lista" }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="xl:col-span-3 col-span-12 space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Agendas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!selectedTenantId && (
              <p className="text-xs text-muted-foreground">Selecione um tenant para ver as agendas.</p>
            )}
            {calendarsLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
            {calendars?.map((cal) => {
              const c = EVENT_COLORS[cal.color] || EVENT_COLORS.primary;
              return (
                <div
                  key={cal.id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${selectedCalendarId === cal.id ? "bg-muted" : "hover:bg-muted/50"}`}
                  onClick={() => setSelectedCalendarId(cal.id === selectedCalendarId ? "all" : cal.id)}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.bg }} />
                  <span className="text-foreground flex-1">{cal.name}</span>
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Próximos Eventos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
            {eventsLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
            {events.slice(0, 5).map((ev) => (
              <div key={String(ev.id)} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{ev.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {typeof ev.start === "string" ? formatDateTimeBR(ev.start) : ""}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {calendars?.find(c => c.id === ev.extendedProps?.calendarId)?.name || "Agenda"}
                </p>
              </div>
            ))}
            {!eventsLoading && events.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum evento encontrado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEventId ? "Editar Evento" : "Novo Evento"}</DialogTitle>
            {dialogDateLabel && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                {dialogDateLabel}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nome do evento" autoFocus />
            </div>

            <div className="space-y-2">
              <Label>Agenda</Label>
              <Select value={eventCalendarId} onValueChange={setEventCalendarId}>
                <SelectTrigger><SelectValue placeholder="Selecione a agenda" /></SelectTrigger>
                <SelectContent>
                  {calendars?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={allDay} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data fim</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora fim</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={allDay} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allDay"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="allDay" className="text-sm font-normal cursor-pointer">Dia inteiro</Label>
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={newColor} onValueChange={setNewColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_COLORS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: val.bg }} />
                        {val.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reminder section — só aparece se houver agente com reminder_enabled */}
            {reminderAgents.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium">Enviar lembrete</Label>
                  </div>
                  <Switch checked={sendReminder} onCheckedChange={setSendReminder} />
                </div>

                {sendReminder && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">WhatsApp do cliente</Label>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          value={reminderPhone}
                          onChange={(e) => setReminderPhone(e.target.value)}
                          placeholder="11999999999"
                          className="h-9 font-mono text-sm"
                        />
                      </div>
                    </div>

                    {reminderAgents.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Agente</Label>
                        <Select value={reminderAgentId} onValueChange={setReminderAgentId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o agente" /></SelectTrigger>
                          <SelectContent>
                            {reminderAgents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      O lembrete será enviado via WAHA com a antecedência configurada no agente.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Para enviar lembretes: Agentes → Editar agente → Lembrete de Agendamento → ative &quot;Enviar lembrete&quot;. O agente deve estar ativo ou em teste. Verifique se o tenant selecionado está correto.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            {editingEventId && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteEvent.isPending}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            )}
            <Button onClick={handleSave} disabled={!newTitle.trim() || createEvent.isPending || updateEvent.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Calendar Dialog */}
      <Dialog open={newCalDialogOpen} onOpenChange={setNewCalDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Agenda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome da Agenda</Label>
              <Input value={newCalName} onChange={(e) => setNewCalName(e.target.value)} placeholder="Ex: Dr. João Silva" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={newCalColor} onValueChange={setNewCalColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_COLORS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: val.bg }} />
                        {val.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateCalendar} disabled={!newCalName.trim() || createCalendar.isPending}>
              Criar Agenda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
