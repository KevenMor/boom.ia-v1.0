import { useState, useRef, useMemo } from "react";
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
import { Plus, Trash2, Clock } from "lucide-react";

const EVENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  primary: { bg: "hsl(var(--primary))", border: "hsl(var(--primary))", label: "Padrão" },
  success: { bg: "hsl(var(--success))", border: "hsl(var(--success))", label: "Sucesso" },
  warning: { bg: "hsl(var(--warning))", border: "hsl(var(--warning))", label: "Aviso" },
  destructive: { bg: "hsl(var(--destructive))", border: "hsl(var(--destructive))", label: "Urgente" },
  accent: { bg: "hsl(var(--accent-foreground))", border: "hsl(var(--accent-foreground))", label: "Destaque" },
};

const INITIAL_EVENTS: EventInput[] = [
  { id: "1", title: "Reunião de Sprint", start: new Date().toISOString().split("T")[0] + "T09:00:00", end: new Date().toISOString().split("T")[0] + "T10:00:00", backgroundColor: "hsl(262 72% 62%)", borderColor: "hsl(262 72% 62%)", extendedProps: { color: "primary" } },
  { id: "2", title: "Deploy Produção", start: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0] + "T14:00:00", end: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0] + "T15:30:00", backgroundColor: "hsl(158 60% 44%)", borderColor: "hsl(158 60% 44%)", extendedProps: { color: "success" } },
  { id: "3", title: "Review de Código", start: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0] + "T11:00:00", end: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0] + "T12:00:00", backgroundColor: "hsl(38 80% 55%)", borderColor: "hsl(38 80% 55%)", extendedProps: { color: "warning" } },
  { id: "4", title: "Deadline Entrega", start: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0] + "T08:00:00", end: new Date(Date.now() + 9 * 86400000).toISOString().split("T")[0] + "T18:00:00", backgroundColor: "hsl(0 68% 55%)", borderColor: "hsl(0 68% 55%)", extendedProps: { color: "destructive" } },
];

const CATEGORY_LIST = [
  { key: "calendar", label: "Eventos do Calendário", color: "primary" },
  { key: "meeting", label: "Reuniões", color: "accent" },
  { key: "deadline", label: "Deadlines", color: "destructive" },
  { key: "deploy", label: "Deploys", color: "success" },
  { key: "reminder", label: "Lembretes", color: "warning" },
];

function formatDateTimeBR(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function extractTime(dateStr: string): string {
  if (!dateStr) return "08:00";
  // Handle ISO strings and plain date strings
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

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<EventInput[]>(INITIAL_EVENTS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventClickArg | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState("primary");
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("09:00");
  const [allDay, setAllDay] = useState(false);

  const handleDateSelect = (info: DateSelectArg) => {
    setSelectInfo(info);
    setNewTitle("");
    setNewColor("primary");
    setSelectedEvent(null);
    setAllDay(info.allDay);
    setStartDate(extractDate(info.startStr));
    setStartTime(info.allDay ? "08:00" : extractTime(info.startStr));
    setEndDate(extractDate(info.endStr));
    setEndTime(info.allDay ? "09:00" : extractTime(info.endStr));
    setDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    setSelectedEvent(info);
    setNewTitle(info.event.title);
    setNewColor(info.event.extendedProps?.color || "primary");
    setSelectInfo(null);

    const evStart = info.event.startStr;
    const evEnd = info.event.endStr || evStart;
    setAllDay(info.event.allDay);
    setStartDate(extractDate(evStart));
    setStartTime(info.event.allDay ? "08:00" : extractTime(evStart));
    setEndDate(extractDate(evEnd));
    setEndTime(info.event.allDay ? "09:00" : extractTime(evEnd));
    setDialogOpen(true);
  };

  const handleSave = () => {
    const colorDef = EVENT_COLORS[newColor];
    const finalStart = allDay ? startDate : `${startDate}T${startTime}:00`;
    const finalEnd = allDay ? endDate : `${endDate}T${endTime}:00`;

    if (selectedEvent) {
      selectedEvent.event.setProp("title", newTitle);
      selectedEvent.event.setProp("backgroundColor", colorDef.bg);
      selectedEvent.event.setProp("borderColor", colorDef.border);
      selectedEvent.event.setExtendedProp("color", newColor);
      selectedEvent.event.setDates(finalStart, finalEnd, { allDay });
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedEvent.event.id
            ? { ...e, title: newTitle, start: finalStart, end: finalEnd, allDay, backgroundColor: colorDef.bg, borderColor: colorDef.border, extendedProps: { color: newColor } }
            : e
        )
      );
    } else if (newTitle.trim()) {
      const id = String(Date.now());
      const newEvent: EventInput = {
        id,
        title: newTitle,
        start: finalStart,
        end: finalEnd,
        allDay,
        backgroundColor: colorDef.bg,
        borderColor: colorDef.border,
        extendedProps: { color: newColor },
      };
      setEvents((prev) => [...prev, newEvent]);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (selectedEvent) {
      selectedEvent.event.remove();
      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.event.id));
    }
    setDialogOpen(false);
  };

  const dialogDateLabel = useMemo(() => {
    if (selectedEvent) {
      const s = selectedEvent.event.startStr;
      const e = selectedEvent.event.endStr;
      if (selectedEvent.event.allDay) {
        return new Date(s).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
      }
      return `${formatDateTimeBR(s)}${e ? ` — ${formatDateTimeBR(e)}` : ""}`;
    }
    if (selectInfo) {
      if (selectInfo.allDay) {
        return new Date(selectInfo.startStr).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
      }
      return `${formatDateTimeBR(selectInfo.startStr)} — ${formatDateTimeBR(selectInfo.endStr)}`;
    }
    return "";
  }, [selectedEvent, selectInfo]);

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Calendar */}
      <div className="xl:col-span-9 col-span-12">
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
              selectable
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
              slotLabelFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              eventTimeFormat={{
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }}
              nowIndicator
              allDayText="Dia todo"
              buttonText={{
                today: "Hoje",
                month: "Mês",
                week: "Semana",
                day: "Dia",
                list: "Lista",
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="xl:col-span-3 col-span-12 space-y-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Categorias</CardTitle>
            <Button size="sm" onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              setSelectInfo({ startStr: today, endStr: today, allDay: true } as DateSelectArg);
              setNewTitle(""); setNewColor("primary"); setSelectedEvent(null);
              setStartDate(today); setEndDate(today);
              setStartTime("08:00"); setEndTime("09:00"); setAllDay(false);
              setDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {CATEGORY_LIST.map((cat) => {
              const c = EVENT_COLORS[cat.color];
              return (
                <div key={cat.key} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.bg }} />
                  <span className="text-foreground">{cat.label}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Atividade</CardTitle>
            <Button variant="outline" size="sm">Ver todos</Button>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[400px] overflow-y-auto">
            {events.slice(0, 5).map((ev) => (
              <div key={String(ev.id)} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{ev.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {typeof ev.start === "string" ? formatDateTimeBR(ev.start) : ""}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Evento agendado</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
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

            {/* Date & Time fields */}
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
          </div>
          <DialogFooter className="gap-2">
            {selectedEvent && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            )}
            <Button onClick={handleSave} disabled={!newTitle.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
