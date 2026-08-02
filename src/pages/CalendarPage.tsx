import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventInput, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { DateInputBR } from "@/components/ui/date-input-br";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Clock, CalendarDays, Bell, MessageSquare, Phone, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantContext } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenants } from "@/hooks/useTenants";
import { useCalendars, useCreateCalendar } from "@/hooks/useCalendars";
import { useCalendarEvents, useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent } from "@/hooks/useCalendarEvents";
import { useAgents } from "@/hooks/useAgents";
import { usePendingReminders } from "@/hooks/usePendingReminders";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Calendar } from "@/types/calendar";
import { CalendarServicesTab } from "@/components/calendar/CalendarServicesTab";

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

/** Exibe remind_at em Brasília. Trata valores sem timezone (ex: do Supabase) como UTC. */
function formatRemindAtBR(dateStr: string | undefined): string {
  if (!dateStr) return "";
  let s = dateStr.trim();
  if (!s.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(s)) s = s + "Z";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Para Lembretes e Próximos Eventos: trata data em UTC (+00:00/Z) como horário de Brasília na exibição. */
function formatDateTimeBRAsBrasilia(dateStr: string | undefined): string {
  if (!dateStr) return "";
  let s = dateStr.trim();
  if (s.endsWith("Z")) s = s.replace(/Z$/, "-03:00");
  else if (/\+00:00$/.test(s)) s = s.replace(/\+00:00$/, "-03:00");
  const d = new Date(s);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Converte ISO UTC para ISO BRT (-03:00) para o FullCalendar exibir corretamente. */
function utcToBrasiliaISO(isoDate: string | undefined): string {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
  } catch {
    return isoDate;
  }
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

/** Extrai ID numérico para chatwoot_conversation_id */
function parseChatwootConvId(raw: string): number | null {
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return isNaN(n) ? null : n;
}

const VIEW_OPTIONS = [
  { id: "dayGridMonth", label: "Mês" },
  { id: "timeGridWeek", label: "Semana" },
  { id: "timeGridDay", label: "Dia" },
  { id: "listWeek", label: "Lista" },
] as const;

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const { selectedTenantId: globalTenantId } = useTenantContext();
  const [currentView, setCurrentView] = useState<string>("");
  const [sidebarSheetOpen, setSidebarSheetOpen] = useState(false);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api && isMobile && api.view.type !== "listWeek") {
      api.changeView("listWeek");
    } else if (api && !isMobile && api.view.type !== "dayGridMonth") {
      api.changeView("dayGridMonth");
    }
  }, [isMobile]);

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
  const qc = useQueryClient();
  const { data: pendingReminders, refetch: refetchReminders } = usePendingReminders(selectedTenantId || undefined);
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const createCalendar = useCreateCalendar();

  // Map DB events to FullCalendar format (converte UTC → BRT para exibição correta)
  const events: EventInput[] = useMemo(() => {
    if (!dbEvents) return [];
    return dbEvents.map((ev) => {
      const colorDef = EVENT_COLORS[ev.color] || EVENT_COLORS.primary;
      const start = ev.all_day ? ev.start_at : utcToBrasiliaISO(ev.start_at);
      const end = ev.all_day ? (ev.end_at || undefined) : (ev.end_at ? utcToBrasiliaISO(ev.end_at) : undefined);
      return {
        id: ev.id,
        title: ev.title,
        start,
        end,
        allDay: ev.all_day,
        backgroundColor: colorDef.bg,
        borderColor: colorDef.border,
        extendedProps: { color: ev.color, calendarId: ev.calendar_id, dbEvent: ev },
      };
    });
  }, [dbEvents]);

  // Lembretes: apenas os cujo evento ainda existe no calendário (evita órfãos)
  const validReminders = useMemo(() => {
    if (!pendingReminders || !dbEvents) return pendingReminders ?? [];
    const eventIds = new Set(dbEvents.map((e) => e.id));
    return pendingReminders.filter((r) => eventIds.has(r.calendar_event_id));
  }, [pendingReminders, dbEvents]);

  // Próximos eventos: apenas futuros (start >= agora), ordenados por data
  const upcomingEvents = useMemo(() => {
    const nowMs = Date.now();
    return events
      .filter((ev) => {
        const start = typeof ev.start === "string" ? ev.start : ev.start instanceof Date ? ev.start.toISOString() : "";
        if (!start) return false;
        const startMs = new Date(start).getTime();
        return startMs >= nowMs;
      })
      .sort((a, b) => {
        const sa = typeof a.start === "string" ? a.start : a.start instanceof Date ? a.start.toISOString() : "";
        const sb = typeof b.start === "string" ? b.start : b.start instanceof Date ? b.start.toISOString() : "";
        return (sa || "").localeCompare(sb || "");
      });
  }, [events]);

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
  const [clientPhone, setClientPhone] = useState("");
  const [sendReminder, setSendReminder] = useState(false);
  const [reminderChatwootConvId, setReminderChatwootConvId] = useState("");
  const [reminderPhone, setReminderPhone] = useState("");
  const [reminderAgentId, setReminderAgentId] = useState("");

  // Refetch agents e lembretes ao abrir o modal (para pegar config atualizado apos editar agente)
  useEffect(() => {
    if (dialogOpen) {
      refetchAgents();
      refetchReminders();
    }
  }, [dialogOpen, refetchAgents, refetchReminders]);

  // Agents with reminders enabled (active ou test, com reminder_enabled no config)
  const reminderAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a => {
      const cfg = (a.config || {}) as Record<string, unknown>;
      const enabled = cfg.reminder_enabled === true || cfg.reminder_enabled === "true";
      return (a.status === "active" || a.status === "test") && enabled;
    });
  }, [agents]);

  // Reset sendReminder quando não há agentes configurados (evita estado inconsistente)
  useEffect(() => {
    if (reminderAgents.length === 0 && sendReminder) setSendReminder(false);
  }, [reminderAgents.length, sendReminder]);

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
    setClientPhone("");
    setSendReminder(false);
    setReminderChatwootConvId("");
    setReminderPhone("");
    setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    setDialogOpen(true);
  }, [selectedTenantId, calendars, selectedCalendarId, reminderAgents]);

  const handleFabNewEvent = useCallback(() => {
    if (!selectedTenantId || !calendars?.length) {
      toast.error("Selecione um tenant e crie uma agenda primeiro.");
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSelectedEventClick(null);
    setEditingEventId(null);
    setNewTitle("");
    setNewColor("primary");
    setEventCalendarId(selectedCalendarId === "all" ? calendars[0].id : selectedCalendarId);
    setAllDay(false);
    setStartDate(extractDate(now.toISOString()));
    setStartTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setEndDate(extractDate(end.toISOString()));
    setEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
    setClientPhone("");
    setSendReminder(false);
    setReminderChatwootConvId("");
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

    const dbEvent = ep.dbEvent as any;
    setClientPhone((dbEvent?.metadata as Record<string, any>)?.client_phone || "");

    if (selectedTenantId) {
      // Busca lembrete criado manualmente OU pela IA (qualquer conversation_id)
      const { data: reminder, error } = await supabase
        .from("appointment_reminders")
        .select("agent_id, chatwoot_conversation_id, external_user_id, status")
        .eq("tenant_id", selectedTenantId)
        .eq("calendar_event_id", info.event.id)
        .in("status", ["pending", "sent"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error loading reminder:", error);
      }

      if (reminder) {
        setSendReminder(true);
        setReminderChatwootConvId(
          reminder.chatwoot_conversation_id != null
            ? String(reminder.chatwoot_conversation_id)
            : ""
        );
        setReminderPhone(reminder.external_user_id || "");
        setReminderAgentId(reminder.agent_id);
      } else {
        setSendReminder(false);
        setReminderChatwootConvId("");
        setReminderPhone("");
        setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
      }
    } else {
      setSendReminder(false);
      setReminderChatwootConvId("");
      setReminderPhone("");
      setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    }

    setDialogOpen(true);
  }, [reminderAgents, selectedTenantId]);

  const handleSave = async () => {
    if (!newTitle.trim() || !selectedTenantId || !eventCalendarId) return;
    if (sendReminder && !reminderChatwootConvId.trim() && !reminderPhone.trim()) {
      toast.error("Informe o ID da conversa Chatwoot ou o número de telefone para enviar lembrete.");
      return;
    }
    if (sendReminder && !reminderAgentId) {
      toast.error("Selecione o agente para enviar o lembrete.");
      return;
    }
    // Horário do formulário = Brasília (-03:00); sem timezone o Postgres/JS interpreta errado
    const tz = "-03:00";
    const finalStart = allDay ? `${startDate}T00:00:00${tz}` : `${startDate}T${startTime}:00${tz}`;
    const finalEnd = allDay ? `${endDate}T23:59:59${tz}` : `${endDate}T${endTime}:00${tz}`;

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
          metadata: clientPhone.trim() ? { client_phone: clientPhone.trim() } : null,
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
          metadata: clientPhone.trim() ? { client_phone: clientPhone.trim() } : null,
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
          const eventStartAtISO = eventStartDate.toISOString();
          const cwConvId = parseChatwootConvId(reminderChatwootConvId);
          const extUserId = reminderPhone.trim() || null;

          // Busca lembrete existente (manual ou criado pela IA)
          const { data: existingReminder, error: existingErr } = await supabase
            .from("appointment_reminders")
            .select("id")
            .eq("tenant_id", selectedTenantId)
            .eq("calendar_event_id", eventId)
            .in("status", ["pending", "sent"])
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
                chatwoot_conversation_id: cwConvId,
                external_user_id: extUserId ?? "",
                event_title: newTitle,
                event_start_at: eventStartAtISO,
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
              refetchReminders();
              qc.invalidateQueries({ queryKey: ["appointment-reminders", selectedTenantId] });
            }
          } else {
            const { error: remInsertErr } = await supabase
              .from("appointment_reminders")
              .insert({
                agent_id: reminderAgentId,
                tenant_id: selectedTenantId,
                calendar_event_id: eventId,
                conversation_id: conversationId,
                external_user_id: extUserId ?? "",
                chatwoot_conversation_id: cwConvId,
                event_title: newTitle,
                event_start_at: eventStartAtISO,
                remind_at: remindAt.toISOString(),
                status: "pending",
              });

            if (remInsertErr) {
              console.error("Reminder insert error:", remInsertErr);
              toast.error("Evento salvo, mas erro ao agendar lembrete.");
            } else {
              toast.success("Lembrete agendado! 🔔");
              refetchReminders();
              qc.invalidateQueries({ queryKey: ["appointment-reminders", selectedTenantId] });
            }
          }
        } else if (editingEventId) {
          // Cancela lembrete (manual ou criado pela IA)
          const { error: remCancelErr } = await supabase
            .from("appointment_reminders")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("tenant_id", selectedTenantId)
            .eq("calendar_event_id", eventId)
            .in("status", ["pending", "sent"]);

          if (remCancelErr) {
            console.error("Reminder cancel error:", remCancelErr);
            toast.error("Evento salvo, mas erro ao cancelar lembrete.");
          } else {
            refetchReminders();
            qc.invalidateQueries({ queryKey: ["appointment-reminders", selectedTenantId] });
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar evento.");
    }
    setClientPhone("");
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!editingEventId || !selectedTenantId) return;
    try {
      await deleteEvent.mutateAsync({ id: editingEventId, tenantId: selectedTenantId });
      // Cancela lembretes pendentes vinculados a este evento
      await supabase
        .from("appointment_reminders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("tenant_id", selectedTenantId)
        .eq("calendar_event_id", editingEventId)
        .in("status", ["pending"]);
      refetchReminders();
      qc.invalidateQueries({ queryKey: ["appointment-reminders", selectedTenantId] });
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
    <div className="grid grid-cols-12 gap-5 xl:gap-6">
      {/* Calendar */}
      <div className="col-span-12 space-y-4 xl:col-span-9">
        {/* Filtros — barra leve estilo Google */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/80 bg-card/80 px-4 py-3">
            {!globalTenantId && (
              <div className="min-w-[180px] space-y-1">
                <Label className="text-[12px] font-medium text-muted-foreground">Tenant</Label>
                <Select value={localTenantId} onValueChange={(v) => { setLocalTenantId(v); setSelectedCalendarId("all"); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o tenant" /></SelectTrigger>
                  <SelectContent>
                    {tenants?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {globalTenantId && (
              <div className="min-w-[180px] space-y-1">
                <Label className="text-[12px] font-medium text-muted-foreground">Tenant</Label>
                <p className="py-1.5 text-sm font-medium tracking-[-0.01em]">{tenants?.find(t => t.id === globalTenantId)?.name || "—"}</p>
              </div>
            )}
            <div className="min-w-[180px] space-y-1">
              <Label className="text-[12px] font-medium text-muted-foreground">Agenda</Label>
              <Select value={selectedCalendarId} onValueChange={setSelectedCalendarId} disabled={!selectedTenantId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
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
            <Button size="sm" variant="outline" className="h-9 rounded-full" disabled={!selectedTenantId} onClick={() => setNewCalDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova agenda
            </Button>
            {isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarSheetOpen(true)}
                className="ml-auto h-9 shrink-0 rounded-full"
              >
                <Menu className="mr-1 h-4 w-4" />
                Mais
              </Button>
            )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {isMobile && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-border/70 px-3 py-2.5">
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => calendarRef.current?.getApi().changeView(opt.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    currentView === opt.id
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div className="calendar-wrapper p-3 sm:p-4 md:p-5">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={isMobile ? "listWeek" : "dayGridMonth"}
              headerToolbar={
                isMobile
                  ? { left: "prev,next today", center: "title", right: "" }
                  : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }
              }
              datesSet={(info) => setCurrentView(info.view.type)}
              locale={ptBrLocale}
              timeZone="America/Sao_Paulo"
              selectable={!!selectedTenantId}
              selectMirror
              editable
              dayMaxEvents={3}
              fixedWeekCount={false}
              events={events}
              select={handleDateSelect}
              eventClick={handleEventClick}
              height="auto"
              aspectRatio={1.45}
              slotMinTime="06:00:00"
              slotMaxTime="23:00:00"
              slotDuration="00:30:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              dayHeaderFormat={{ weekday: "short" }}
              titleFormat={{ year: "numeric", month: "long" }}
              nowIndicator
              allDayText="Dia todo"
              buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia", list: "Lista" }}
              moreLinkText={(n) => `+${n}`}
            />
          </div>
        </div>
      </div>

      {/* Sidebar - desktop */}
      <div className={cn("col-span-12 space-y-4 xl:col-span-3", isMobile && "hidden")}>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="mb-3 text-[13px] font-medium tracking-[-0.01em] text-foreground">Minhas agendas</h3>
          <div className="space-y-0.5">
            {!selectedTenantId && (
              <p className="text-[12.5px] text-muted-foreground">Selecione um tenant para ver as agendas.</p>
            )}
            {calendarsLoading && <p className="text-[12.5px] text-muted-foreground">Carregando...</p>}
            {calendars?.map((cal) => {
              const c = EVENT_COLORS[cal.color] || EVENT_COLORS.primary;
              const active = selectedCalendarId === cal.id;
              return (
                <button
                  type="button"
                  key={cal.id}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    active ? "bg-muted/80" : "hover:bg-muted/50",
                  )}
                  onClick={() => setSelectedCalendarId(cal.id === selectedCalendarId ? "all" : cal.id)}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border",
                      active ? "border-transparent" : "border-border/80 bg-transparent",
                    )}
                    style={active ? { backgroundColor: c.bg, borderColor: c.bg } : undefined}
                  >
                    {active ? (
                      <span className="block h-2 w-2 rounded-[1px] bg-white/95" />
                    ) : (
                      <span className="block h-2 w-2 rounded-[1px]" style={{ backgroundColor: c.bg }} />
                    )}
                  </span>
                  <span className="flex-1 truncate font-medium tracking-[-0.01em] text-foreground">{cal.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="mb-3 text-[13px] font-medium tracking-[-0.01em] text-foreground">Serviços</h3>
          <CalendarServicesTab tenantId={selectedTenantId || null} />
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-medium tracking-[-0.01em] text-foreground">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            Lembretes
          </h3>
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {!selectedTenantId && (
              <p className="text-[12.5px] text-muted-foreground">Selecione um tenant.</p>
            )}
            {selectedTenantId && pendingReminders === undefined && <p className="text-[12.5px] text-muted-foreground">Carregando...</p>}
            {selectedTenantId && pendingReminders !== undefined && validReminders.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">Nenhum lembrete pendente.</p>
            )}
            {validReminders.map((r) => (
              <div key={r.id} className="rounded-lg border border-border/70 p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 font-medium tracking-[-0.01em] text-foreground">{r.event_title}</p>
                  <Badge variant={r.status === "sent" ? "secondary" : "default"} className="shrink-0 text-[10px]">
                    {r.status === "sent" ? "Enviado" : "Pendente"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Envio: {formatRemindAtBR(r.remind_at)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h3 className="mb-3 text-[13px] font-medium tracking-[-0.01em] text-foreground">Próximos eventos</h3>
          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {eventsLoading && <p className="text-[12.5px] text-muted-foreground">Carregando...</p>}
            {upcomingEvents.slice(0, 5).map((ev) => (
              <div key={String(ev.id)} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium tracking-[-0.01em] text-foreground">{ev.title}</p>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {typeof ev.start === "string" ? formatDateTimeBR(ev.start) : ev.start instanceof Date ? formatDateTimeBR(ev.start.toISOString()) : ""}
                  </Badge>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {calendars?.find(c => c.id === ev.extendedProps?.calendarId)?.name || "Agenda"}
                </p>
              </div>
            ))}
            {!eventsLoading && upcomingEvents.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">Nenhum evento futuro.</p>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Sheet - mobile */}
      {isMobile && (
        <Sheet open={sidebarSheetOpen} onOpenChange={setSidebarSheetOpen}>
          <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Agendas e mais</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Agendas</h3>
                {!selectedTenantId && (
                  <p className="text-xs text-muted-foreground">Selecione um tenant para ver as agendas.</p>
                )}
                {calendarsLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
                <div className="space-y-1">
                  {calendars?.map((cal) => {
                    const c = EVENT_COLORS[cal.color] || EVENT_COLORS.primary;
                    return (
                      <div
                        key={cal.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors",
                          selectedCalendarId === cal.id ? "bg-muted" : "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          setSelectedCalendarId(cal.id === selectedCalendarId ? "all" : cal.id);
                          setSidebarSheetOpen(false);
                        }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.bg }} />
                        <span className="text-foreground flex-1">{cal.name}</span>
                        <CalendarDays className="h-3 w-3 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
                <Button size="sm" variant="outline" className="mt-2 w-full" disabled={!selectedTenantId} onClick={() => { setNewCalDialogOpen(true); setSidebarSheetOpen(false); }}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Agenda
                </Button>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3">Serviços</h3>
                <CalendarServicesTab tenantId={selectedTenantId || null} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Bell className="h-4 w-4 text-primary" />
                  Lembretes agendados
                </h3>
                {!selectedTenantId && <p className="text-xs text-muted-foreground">Selecione um tenant.</p>}
                {selectedTenantId && pendingReminders === undefined && <p className="text-xs text-muted-foreground">Carregando...</p>}
                {selectedTenantId && pendingReminders !== undefined && validReminders.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum lembrete pendente.</p>
                )}
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {validReminders.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border p-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-foreground line-clamp-1">{r.event_title}</p>
                        <Badge variant={r.status === "sent" ? "secondary" : "default"} className="text-[10px] shrink-0">
                          {r.status === "sent" ? "Enviado" : "Pendente"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Envio: {formatRemindAtBR(r.remind_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Próximos Eventos</h3>
                {eventsLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {upcomingEvents.slice(0, 5).map((ev) => (
                    <div key={String(ev.id)} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{ev.title}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {typeof ev.start === "string" ? formatDateTimeBR(ev.start) : ev.start instanceof Date ? formatDateTimeBR(ev.start.toISOString()) : ""}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {calendars?.find(c => c.id === ev.extendedProps?.calendarId)?.name || "Agenda"}
                      </p>
                    </div>
                  ))}
                  {!eventsLoading && upcomingEvents.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum evento futuro.</p>
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* FAB - mobile */}
      {isMobile && (
        <button
          onClick={handleFabNewEvent}
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
          aria-label="Novo evento"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

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
                <DateInputBR value={startDate} onChange={setStartDate} placeholder="DD/MM/AAAA" />
              </div>
              <div className="space-y-2">
                <Label>Hora início</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={allDay} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data fim</Label>
                <DateInputBR value={endDate} onChange={setEndDate} placeholder="DD/MM/AAAA" />
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

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telefone do cliente</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="11999999999"
                  className="h-9 font-mono text-sm"
                />
              </div>
            </div>

            {/* Reminder section — sempre visível; desabilitada quando não há agente com reminder_enabled */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-medium">Enviar lembrete</Label>
                </div>
                <Switch
                  checked={sendReminder}
                  onCheckedChange={setSendReminder}
                  disabled={reminderAgents.length === 0}
                />
              </div>

              {reminderAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Para enviar lembretes: Agentes → Editar agente → Lembrete de Agendamento → ative &quot;Enviar lembrete&quot;. O agente deve estar ativo ou em teste. Verifique se o tenant selecionado está correto.
                </p>
              ) : sendReminder ? (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Telefone do cliente</Label>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        value={reminderPhone}
                        onChange={(e) => setReminderPhone(e.target.value)}
                        placeholder="11999999999 (para agendamento manual)"
                        className="h-9 font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">ID conversation Chatwoot</Label>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        value={reminderChatwootConvId}
                        onChange={(e) => setReminderChatwootConvId(e.target.value)}
                        placeholder="12345 (preenchido pela IA ao agendar)"
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
                      O lembrete será enviado via WAHA (WhatsApp) ou na conversa Chatwoot. Preencha o telefone para agendamento manual ou o ID para agendamentos feitos pela IA.
                    </p>
                </div>
              ) : null}
            </div>
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
