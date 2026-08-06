import { useState, useRef, useMemo, useCallback, useEffect, type ReactNode } from "react";
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
import { Plus, Trash2, Clock, CalendarDays, Bell, MessageSquare, Phone, Menu, User, ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenants } from "@/hooks/useTenants";
import { useCalendars, useCreateCalendar } from "@/hooks/useCalendars";
import { useCalendarEvents, useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent } from "@/hooks/useCalendarEvents";
import { useAgents } from "@/hooks/useAgents";
import { usePendingReminders } from "@/hooks/usePendingReminders";
import { useTenantMembers } from "@/hooks/useTenantMembers";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Calendar } from "@/types/calendar";
import {
  APPOINTMENT_INTEREST_OPTIONS,
  buildAppointmentMetadata,
  findPersonalCalendar,
  isCalendarScopedUser,
} from "@/lib/calendar-ownership";

const EVENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  primary: { bg: "hsl(262 72% 62%)", border: "hsl(262 72% 62%)", label: "Padrão" },
  success: { bg: "hsl(158 60% 44%)", border: "hsl(158 60% 44%)", label: "Sucesso" },
  warning: { bg: "hsl(38 80% 55%)", border: "hsl(38 80% 55%)", label: "Aviso" },
  destructive: { bg: "hsl(0 68% 55%)", border: "hsl(0 68% 55%)", label: "Urgente" },
  accent: { bg: "hsl(210 60% 50%)", border: "hsl(210 60% 50%)", label: "Destaque" },
};

/** Campo com altura confortável em toque (44px) e compacta no desktop. */
const FIELD_H = "h-11 sm:h-10";

/** Bloco do formulário de compromisso — separa grupos de campos por uma régua. */
function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <div className="flex min-h-[2rem] items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

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

/** No celular a semana em grade é imprecisa para o dedo — fica fora. */
const MOBILE_VIEW_OPTIONS = [
  { id: "listWeek", label: "Lista" },
  { id: "timeGridDay", label: "Dia" },
  { id: "dayGridMonth", label: "Mês" },
] as const;

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const { selectedTenantId: globalTenantId } = useTenantContext();
  const { user, profile, isSuperAdmin, isTenantAdmin, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>("");
  const [calendarTitle, setCalendarTitle] = useState<string>("");
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
  const calendarScoped =
    !authLoading &&
    isCalendarScopedUser({
      isSuperAdmin,
      isTenantAdmin: isTenantAdmin(selectedTenantId),
    });
  const { data: calendars, isLoading: calendarsLoading } = useCalendars(selectedTenantId || undefined);
  const { data: tenantMembers } = useTenantMembers(
    !calendarScoped && selectedTenantId ? selectedTenantId : undefined
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("all");

  // Corretor não tem opção "todas": fixa na agenda pessoal (ou na primeira visível)
  useEffect(() => {
    if (!calendarScoped || !calendars?.length) return;
    const target = findPersonalCalendar(calendars, user?.id) ?? calendars[0];
    if (target && selectedCalendarId !== target.id) {
      setSelectedCalendarId(target.id);
    }
  }, [calendarScoped, calendars, user?.id, selectedCalendarId]);

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
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [sendReminder, setSendReminder] = useState(false);
  const [reminderChatwootConvId, setReminderChatwootConvId] = useState("");
  const [reminderPhone, setReminderPhone] = useState("");
  const [reminderAgentId, setReminderAgentId] = useState("");

  const resolveDefaultCalendarId = useCallback(() => {
    if (!calendars?.length) return "";
    if (calendarScoped && user?.id) {
      return findPersonalCalendar(calendars, user.id)?.id ?? calendars[0].id;
    }
    if (selectedCalendarId !== "all") return selectedCalendarId;
    return calendars[0].id;
  }, [calendars, calendarScoped, user?.id, selectedCalendarId]);

  const resolveDefaultAssignee = useCallback(() => {
    if (calendarScoped && user?.id) return user.id;
    return "";
  }, [calendarScoped, user?.id]);

  const applyAssigneeCalendar = useCallback(
    (userId: string) => {
      setAssignedUserId(userId);
      if (!userId || !calendars?.length) return;
      const owned = calendars.find((c) => c.owner_user_id === userId);
      if (owned) setEventCalendarId(owned.id);
    },
    [calendars]
  );

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
  const [newCalOwnerId, setNewCalOwnerId] = useState("");

  const handleDateSelect = useCallback((info: DateSelectArg) => {
    if (!selectedTenantId || !calendars?.length) {
      toast.error("Selecione um tenant e crie uma agenda primeiro.");
      return;
    }
    setSelectedEventClick(null);
    setEditingEventId(null);
    setNewTitle("");
    setNewColor("primary");
    setEventCalendarId(resolveDefaultCalendarId());
    setAllDay(info.allDay);
    setStartDate(extractDate(info.startStr));
    setStartTime(info.allDay ? "08:00" : extractTime(info.startStr));
    setEndDate(extractDate(info.endStr));
    setEndTime(info.allDay ? "09:00" : extractTime(info.endStr));
    setClientName("");
    setClientPhone("");
    setInterest("");
    setAssignedUserId(resolveDefaultAssignee());
    setSendReminder(false);
    setReminderChatwootConvId("");
    setReminderPhone("");
    setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    setDialogOpen(true);
  }, [selectedTenantId, calendars, resolveDefaultCalendarId, resolveDefaultAssignee, reminderAgents]);

  /** Toque num dia (mobile): abre o formulário já naquela data, 1h a partir das 09h. */
  const handleDateClick = useCallback((info: { dateStr: string; allDay: boolean }) => {
    if (!selectedTenantId || !calendars?.length) {
      toast.error("Selecione um tenant e crie uma agenda primeiro.");
      return;
    }
    const day = extractDate(info.dateStr);
    const clickedTime = info.allDay ? "" : extractTime(info.dateStr);
    const startAt = clickedTime || "09:00";
    const [h, m] = startAt.split(":").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    setSelectedEventClick(null);
    setEditingEventId(null);
    setNewTitle("");
    setNewColor("primary");
    setEventCalendarId(resolveDefaultCalendarId());
    setAllDay(false);
    setStartDate(day);
    setStartTime(startAt);
    setEndDate(day);
    setEndTime(`${pad((h + 1) % 24)}:${pad(m)}`);
    setClientName("");
    setClientPhone("");
    setInterest("");
    setAssignedUserId(resolveDefaultAssignee());
    setSendReminder(false);
    setReminderChatwootConvId("");
    setReminderPhone("");
    setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    setDialogOpen(true);
  }, [selectedTenantId, calendars, resolveDefaultCalendarId, resolveDefaultAssignee, reminderAgents]);

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
    setEventCalendarId(resolveDefaultCalendarId());
    setAllDay(false);
    setStartDate(extractDate(now.toISOString()));
    setStartTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setEndDate(extractDate(end.toISOString()));
    setEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
    setClientName("");
    setClientPhone("");
    setInterest("");
    setAssignedUserId(resolveDefaultAssignee());
    setSendReminder(false);
    setReminderChatwootConvId("");
    setReminderPhone("");
    setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    setDialogOpen(true);
  }, [selectedTenantId, calendars, resolveDefaultCalendarId, resolveDefaultAssignee, reminderAgents]);

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

    const dbEvent = ep.dbEvent as { metadata?: Record<string, unknown> } | undefined;
    const meta = (dbEvent?.metadata ?? {}) as Record<string, unknown>;
    setClientName(typeof meta.client_name === "string" ? meta.client_name : "");
    setClientPhone(typeof meta.client_phone === "string" ? meta.client_phone : "");
    setInterest(typeof meta.interest === "string" ? meta.interest : "");
    const assigned =
      typeof meta.assigned_user_id === "string"
        ? meta.assigned_user_id
        : calendarScoped && user?.id
          ? user.id
          : "";
    setAssignedUserId(assigned);

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
        setReminderPhone(typeof meta.client_phone === "string" ? meta.client_phone : "");
        setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
      }
    } else {
      setSendReminder(false);
      setReminderChatwootConvId("");
      setReminderPhone("");
      setReminderAgentId(reminderAgents.length === 1 ? reminderAgents[0].id : "");
    }

    setDialogOpen(true);
  }, [reminderAgents, selectedTenantId, calendarScoped, user?.id]);

  const handleSave = async () => {
    if (!newTitle.trim() || !selectedTenantId || !eventCalendarId) return;
    const phoneForReminder = (reminderPhone.trim() || clientPhone.trim());
    if (sendReminder && !reminderChatwootConvId.trim() && !phoneForReminder) {
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

    const prevMeta =
      (selectedEventClick?.event.extendedProps?.dbEvent as { metadata?: Record<string, unknown> } | undefined)
        ?.metadata ?? null;
    const metadata = buildAppointmentMetadata({
      clientName,
      clientPhone,
      interest,
      assignedUserId: assignedUserId || resolveDefaultAssignee(),
      previous: prevMeta,
    });

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
          metadata,
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
          metadata,
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
          const extUserId = phoneForReminder || null;

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
    setClientName("");
    setClientPhone("");
    setInterest("");
    setAssignedUserId("");
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
        owner_user_id: newCalOwnerId || null,
      });
      toast.success("Agenda criada!");
      setNewCalDialogOpen(false);
      setNewCalName("");
      setNewCalOwnerId("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar agenda.");
    }
  };

  const dialogDateLabel = useMemo(() => {
    const s = `${startDate}T${startTime}`;
    const e = `${endDate}T${endTime}`;
    if (allDay) {
      const label = new Date(startDate).toLocaleDateString("pt-BR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
      });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return `${formatDateTimeBR(s)} — ${formatDateTimeBR(e)}`;
  }, [startDate, startTime, endDate, endTime, allDay]);

  return (
    <div className={cn("grid grid-cols-12 gap-5 xl:gap-6", isMobile && "pb-24")}>
      {/* Calendar */}
      <div className="col-span-12 space-y-4 xl:col-span-9">
        {isMobile ? (
          /* Barra mobile: navegação por toque no topo, filtros no sheet "Mais" */
          <div className="sticky top-0 z-20 -mx-6 -mt-6 space-y-2 border-b border-border/70 bg-background/95 px-4 pb-2.5 pt-3 backdrop-blur">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Período anterior"
                onClick={() => calendarRef.current?.getApi().prev()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Próximo período"
                onClick={() => calendarRef.current?.getApi().next()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <p className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold tracking-[-0.01em]">
                {calendarTitle}
              </p>
              <button
                type="button"
                onClick={() => calendarRef.current?.getApi().today()}
                className="h-11 shrink-0 rounded-full px-3 text-[13px] font-medium text-primary active:bg-primary/10"
              >
                Hoje
              </button>
              <button
                type="button"
                aria-label="Agendas e filtros"
                onClick={() => setSidebarSheetOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-muted"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {MOBILE_VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => calendarRef.current?.getApi().changeView(opt.id)}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors",
                    currentView === opt.id
                      ? "bg-primary/12 text-primary"
                      : "bg-muted/60 text-muted-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Filtros — barra leve estilo Google */
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
              <Select
                value={selectedCalendarId}
                onValueChange={setSelectedCalendarId}
                disabled={!selectedTenantId || calendarScoped}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  {!calendarScoped && <SelectItem value="all">Todas as agendas</SelectItem>}
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
            {!calendarScoped && (
              <Button size="sm" variant="outline" className="h-9 rounded-full" disabled={!selectedTenantId} onClick={() => setNewCalDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Nova agenda
              </Button>
            )}
          </div>
        )}

        <div
          className={cn(
            "overflow-hidden bg-card",
            isMobile
              ? "-mx-2 rounded-none border-0 shadow-none"
              : "rounded-xl border border-border/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          )}
        >
          <div className={cn("calendar-wrapper", isMobile ? "is-mobile px-1 py-1" : "p-4 md:p-5")}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView={isMobile ? "listWeek" : "dayGridMonth"}
              headerToolbar={
                isMobile
                  ? false
                  : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }
              }
              datesSet={(info) => {
                setCurrentView(info.view.type);
                setCalendarTitle(info.view.title);
              }}
              locale={ptBrLocale}
              timeZone="America/Sao_Paulo"
              selectable={!!selectedTenantId && !isMobile}
              selectMirror
              editable={!isMobile}
              dayMaxEvents={isMobile ? 2 : 3}
              fixedWeekCount={false}
              events={events}
              select={handleDateSelect}
              dateClick={isMobile ? handleDateClick : undefined}
              eventClick={handleEventClick}
              height="auto"
              aspectRatio={isMobile ? 0.9 : 1.45}
              slotMinTime={isMobile ? "07:00:00" : "06:00:00"}
              slotMaxTime="23:00:00"
              slotDuration={isMobile ? "01:00:00" : "00:30:00"}
              scrollTime="08:00:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              dayHeaderFormat={{ weekday: "short" }}
              titleFormat={{ year: "numeric", month: "long" }}
              noEventsText="Nenhum compromisso neste período"
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
              {!globalTenantId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Empresa</Label>
                  <Select
                    value={localTenantId}
                    onValueChange={(v) => { setLocalTenantId(v); setSelectedCalendarId("all"); }}
                  >
                    <SelectTrigger className="h-11"><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                    <SelectContent>
                      {tenants?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold mb-2">Agendas</h3>
                {!selectedTenantId && (
                  <p className="text-xs text-muted-foreground">Selecione uma empresa para ver as agendas.</p>
                )}
                {calendarsLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
                <div className="space-y-1">
                  {calendars?.map((cal) => {
                    const c = EVENT_COLORS[cal.color] || EVENT_COLORS.primary;
                    return (
                      <div
                        key={cal.id}
                        className={cn(
                          "flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors active:bg-muted",
                          selectedCalendarId === cal.id ? "bg-muted" : ""
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
                {!calendarScoped && (
                  <Button variant="outline" className="mt-2 h-11 w-full" disabled={!selectedTenantId} onClick={() => { setNewCalDialogOpen(true); setSidebarSheetOpen(false); }}>
                    <Plus className="h-4 w-4 mr-1" /> Nova agenda
                  </Button>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Bell className="h-4 w-4 text-primary" />
                  Lembretes agendados
                </h3>
                {!selectedTenantId && <p className="text-xs text-muted-foreground">Selecione uma empresa.</p>}
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
          className="fixed right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_-4px_rgba(0,0,0,0.35)] transition-transform active:scale-95"
          style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          aria-label="Novo compromisso"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Event Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          overlayClassName="bg-black/50 backdrop-blur-[2px]"
          className="gap-0 overflow-hidden p-0 sm:max-w-2xl sm:rounded-xl sm:p-0"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pb-4 pt-1 sm:px-6 sm:pb-5 sm:pt-2">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {editingEventId ? "Editar compromisso" : "Novo compromisso"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {dialogDateLabel || "Defina o cliente, o horário e o responsável."}
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
            {/* Compromisso */}
            <FormSection title="Compromisso">
              <div className="space-y-1.5">
                <Label htmlFor="evt-title">Título</Label>
                <Input
                  id="evt-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Visita — Lote 12"
                  autoFocus
                  className={FIELD_H}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Label className="text-muted-foreground">Cor</Label>
                <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Cor do evento">
                  {Object.entries(EVENT_COLORS).map(([key, val]) => {
                    const selected = newColor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={val.label}
                        title={val.label}
                        onClick={() => setNewColor(key)}
                        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
                      >
                        <span
                          className={cn(
                            "h-4 w-4 rounded-full ring-offset-2 ring-offset-background transition-all",
                            selected && "ring-2 ring-foreground/70",
                          )}
                          style={{ backgroundColor: val.bg }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </FormSection>

            {/* Cliente */}
            <FormSection title="Cliente">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="evt-client">Nome do cliente</Label>
                  <Input
                    id="evt-client"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Nome completo"
                    className={FIELD_H}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="evt-phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="evt-phone"
                      inputMode="tel"
                      value={clientPhone}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClientPhone(v);
                        if (sendReminder && !reminderPhone.trim()) setReminderPhone(v);
                      }}
                      placeholder="(11) 99999-9999"
                      className={cn(FIELD_H, "pl-9 font-mono text-sm")}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="evt-interest">Interesse</Label>
                  <Input
                    id="evt-interest"
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    list="appointment-interest-options"
                    placeholder="Visita, lote, proposta…"
                    className={FIELD_H}
                  />
                  <datalist id="appointment-interest-options">
                    {APPOINTMENT_INTEREST_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              </div>
            </FormSection>

            {/* Responsável */}
            <FormSection title="Responsável">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Corretor</Label>
                  {calendarScoped ? (
                    <div
                      className={cn(
                        FIELD_H,
                        "flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm",
                      )}
                    >
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{profile?.full_name || user?.email || "Você"}</span>
                    </div>
                  ) : (
                    <Select
                      value={assignedUserId || "__none__"}
                      onValueChange={(v) => applyAssigneeCalendar(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className={FIELD_H}>
                        <SelectValue placeholder="Selecione o corretor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {(tenantMembers ?? []).map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.user_id.slice(0, 8)}
                            {m.role === "tenant_admin" ? " (admin)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Agenda</Label>
                  <Select
                    value={eventCalendarId}
                    onValueChange={setEventCalendarId}
                    disabled={calendarScoped}
                  >
                    <SelectTrigger className={FIELD_H}>
                      <SelectValue placeholder="Selecione a agenda" />
                    </SelectTrigger>
                    <SelectContent>
                      {calendars?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            {/* Horário */}
            <FormSection
              title="Horário"
              action={
                <label
                  htmlFor="allDay"
                  className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    id="allDay"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Dia inteiro
                </label>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <DateInputBR
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="DD/MM/AAAA"
                    className={FIELD_H}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={allDay ? "text-muted-foreground" : undefined}>Hora</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={allDay}
                    className={cn(FIELD_H, allDay && "opacity-50")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim</Label>
                  <DateInputBR
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="DD/MM/AAAA"
                    className={FIELD_H}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={allDay ? "text-muted-foreground" : undefined}>Hora</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={allDay}
                    className={cn(FIELD_H, allDay && "opacity-50")}
                  />
                </div>
              </div>
            </FormSection>

            {/* Lembrete */}
            <FormSection
              title="Lembrete WhatsApp"
              action={
                <Switch
                  checked={sendReminder}
                  onCheckedChange={(checked) => {
                    setSendReminder(checked);
                    if (checked && !reminderPhone.trim() && clientPhone.trim()) {
                      setReminderPhone(clientPhone.trim());
                    }
                  }}
                  disabled={reminderAgents.length === 0}
                  aria-label="Enviar lembrete"
                />
              }
            >
              {reminderAgents.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ative &quot;Enviar lembrete&quot; em Agentes → Editar agente → Lembrete de Agendamento.
                  O agente precisa estar ativo ou em teste.
                </p>
              ) : sendReminder ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="evt-reminder-phone">Telefone do lembrete</Label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="evt-reminder-phone"
                          inputMode="tel"
                          value={reminderPhone}
                          onChange={(e) => setReminderPhone(e.target.value)}
                          placeholder="Preenchido pelo telefone do cliente"
                          className={cn(FIELD_H, "pl-9 font-mono text-sm")}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="evt-cw-id">ID conversa Chatwoot</Label>
                      <div className="relative">
                        <MessageSquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="evt-cw-id"
                          value={reminderChatwootConvId}
                          onChange={(e) => setReminderChatwootConvId(e.target.value)}
                          placeholder="Opcional — agendamento pela IA"
                          className={cn(FIELD_H, "pl-9 font-mono text-sm")}
                        />
                      </div>
                    </div>
                  </div>

                  {reminderAgents.length > 1 && (
                    <div className="space-y-1.5">
                      <Label>Agente</Label>
                      <Select value={reminderAgentId} onValueChange={setReminderAgentId}>
                        <SelectTrigger className={FIELD_H}>
                          <SelectValue placeholder="Selecione o agente" />
                        </SelectTrigger>
                        <SelectContent>
                          {reminderAgents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Enviado via WhatsApp (WAHA) ou na conversa Chatwoot. Telefone para manual; ID para agendas da IA.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ative o interruptor para avisar o cliente antes do compromisso.
                </p>
              )}
            </FormSection>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-t sm:px-6 sm:py-4 sm:pt-4">
            <div className="flex w-full sm:w-auto">
              {editingEventId ? (
                <Button
                  variant="ghost"
                  className="h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10 sm:w-auto"
                  onClick={handleDelete}
                  disabled={deleteEvent.isPending}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Excluir
                </Button>
              ) : (
                <span className="hidden sm:inline" />
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="outline"
                className="h-11 flex-1 sm:h-10 sm:flex-none"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="h-11 flex-1 sm:h-10 sm:min-w-[7.5rem] sm:flex-none"
                onClick={handleSave}
                disabled={!newTitle.trim() || createEvent.isPending || updateEvent.isPending}
              >
                {createEvent.isPending || updateEvent.isPending
                  ? "Salvando…"
                  : editingEventId
                    ? "Salvar alterações"
                    : "Salvar"}
              </Button>
            </div>
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
              <Input value={newCalName} onChange={(e) => setNewCalName(e.target.value)} placeholder="Ex: Agenda — Maria Silva" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Corretor dono (opcional)</Label>
              <Select
                value={newCalOwnerId || "__none__"}
                onValueChange={(v) => setNewCalOwnerId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Compartilhada do tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Compartilhada (sem dono)</SelectItem>
                  {(tenantMembers ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
