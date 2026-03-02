import { useState, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput, DateSelectArg, EventClickArg } from "@fullcalendar/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

const EVENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  primary: { bg: "hsl(var(--primary))", border: "hsl(var(--primary))", label: "Padrão" },
  success: { bg: "hsl(var(--success))", border: "hsl(var(--success))", label: "Sucesso" },
  warning: { bg: "hsl(var(--warning))", border: "hsl(var(--warning))", label: "Aviso" },
  destructive: { bg: "hsl(var(--destructive))", border: "hsl(var(--destructive))", label: "Urgente" },
  accent: { bg: "hsl(var(--accent-foreground))", border: "hsl(var(--accent-foreground))", label: "Destaque" },
};

const INITIAL_EVENTS: EventInput[] = [
  { id: "1", title: "Reunião de Sprint", start: new Date().toISOString().split("T")[0], backgroundColor: "hsl(262 72% 62%)", borderColor: "hsl(262 72% 62%)", extendedProps: { color: "primary" } },
  { id: "2", title: "Deploy Produção", start: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0], backgroundColor: "hsl(158 60% 44%)", borderColor: "hsl(158 60% 44%)", extendedProps: { color: "success" } },
  { id: "3", title: "Review de Código", start: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0], backgroundColor: "hsl(38 80% 55%)", borderColor: "hsl(38 80% 55%)", extendedProps: { color: "warning" } },
  { id: "4", title: "Deadline Entrega", start: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0], end: new Date(Date.now() + 9 * 86400000).toISOString().split("T")[0], backgroundColor: "hsl(0 68% 55%)", borderColor: "hsl(0 68% 55%)", extendedProps: { color: "destructive" } },
];

const CATEGORY_LIST = [
  { key: "calendar", label: "Eventos do Calendário", color: "primary" },
  { key: "meeting", label: "Reuniões", color: "accent" },
  { key: "deadline", label: "Deadlines", color: "destructive" },
  { key: "deploy", label: "Deploys", color: "success" },
  { key: "reminder", label: "Lembretes", color: "warning" },
];

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<EventInput[]>(INITIAL_EVENTS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventClickArg | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState("primary");
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null);

  const handleDateSelect = (info: DateSelectArg) => {
    setSelectInfo(info);
    setNewTitle("");
    setNewColor("primary");
    setSelectedEvent(null);
    setDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    setSelectedEvent(info);
    setNewTitle(info.event.title);
    setNewColor(info.event.extendedProps?.color || "primary");
    setSelectInfo(null);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const colorDef = EVENT_COLORS[newColor];
    if (selectedEvent) {
      selectedEvent.event.setProp("title", newTitle);
      selectedEvent.event.setProp("backgroundColor", colorDef.bg);
      selectedEvent.event.setProp("borderColor", colorDef.border);
      selectedEvent.event.setExtendedProp("color", newColor);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === selectedEvent.event.id
            ? { ...e, title: newTitle, backgroundColor: colorDef.bg, borderColor: colorDef.border, extendedProps: { color: newColor } }
            : e
        )
      );
    } else if (selectInfo && newTitle.trim()) {
      const id = String(Date.now());
      const newEvent: EventInput = {
        id,
        title: newTitle,
        start: selectInfo.startStr,
        end: selectInfo.endStr,
        allDay: selectInfo.allDay,
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
              locale="pt-br"
              selectable
              selectMirror
              editable
              dayMaxEvents
              events={events}
              select={handleDateSelect}
              eventClick={handleEventClick}
              height="auto"
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
        {/* Categories */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Categorias</CardTitle>
            <Button size="sm" onClick={() => { setSelectInfo({ startStr: new Date().toISOString().split("T")[0], endStr: "", allDay: true } as DateSelectArg); setNewTitle(""); setNewColor("primary"); setSelectedEvent(null); setDialogOpen(true); }}>
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

        {/* Activity */}
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
                    {typeof ev.start === "string" ? new Date(ev.start).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : ""}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent ? "Editar Evento" : "Novo Evento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nome do evento" autoFocus />
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
