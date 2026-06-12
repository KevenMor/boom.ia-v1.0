import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2, Paintbrush, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HospedagemSubNav } from "@/components/hospedagem/HospedagemSubNav";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  useBulkUpsertParkDays,
  useDeleteParkDay,
  useLodgingParkDays,
  type LodgingParkDay,
  type LodgingParkDayEventLabel,
  type LodgingParkDayKind,
  type ParkTicketLine,
  formatParkTicketPreview,
  parseParkTicketLines,
  serializeParkTicketLines,
} from "@/hooks/useHospedagem";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";
const stitchCard =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6";

const KIND_META: Record<
  LodgingParkDayKind,
  { label: string; badge: string; cell: string }
> = {
  aberto: {
    label: "Aberto",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    cell: "bg-emerald-500/15 border-emerald-500/40 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
  },
  fechado: {
    label: "Fechado",
    badge: "bg-muted text-muted-foreground border-border",
    cell: "bg-muted/80 border-muted-foreground/30 text-muted-foreground",
  },
  manutencao: {
    label: "Manutenção",
    badge: "bg-amber-500/15 text-amber-900 dark:text-amber-400 border-amber-500/30",
    cell: "bg-amber-500/15 border-amber-500/40 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100",
  },
};

const EVENT_TAG_META: Record<LodgingParkDayEventLabel, { label: string }> = {
  promocional: { label: "Promocional" },
  evento: { label: "Evento" },
  normal: { label: "Normal" },
};

const MAX_TICKET_CHARS = 4096;
/** Sentinela do Select de etiqueta: Radix não permite `value=""`. */
const NONE_TAG = "__none__";

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function ParkCalendarManagementPage() {
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();
  const canEdit = Boolean(selectedTenantId && (isSuperAdmin || isTenantAdmin(selectedTenantId)));

  const [view, setView] = useState(() => startOfMonth(new Date()));
  const year = view.getFullYear();
  const month = view.getMonth() + 1;

  const { data, isLoading, error, refetch } = useLodgingParkDays(selectedTenantId ?? undefined, year, month);
  const bulkUpsert = useBulkUpsertParkDays();
  const delDay = useDeleteParkDay();

  const serverByDate = useMemo(() => {
    const m = new Map<string, LodgingParkDay>();
    for (const row of data?.data ?? []) {
      const key = row.calendar_date.slice(0, 10);
      m.set(key, row);
    }
    return m;
  }, [data?.data]);

  /** Alterações locais antes de gravar — mescla sobre o servidor. */
  const [pending, setPending] = useState<
    Record<
      string,
      {
        day_kind: LodgingParkDayKind;
        event_label: LodgingParkDayEventLabel | null;
        park_ticket_value: string | null;
        deleted?: boolean;
      }
    >
  >({});

  const [brush, setBrush] = useState<LodgingParkDayKind | null>(null);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgDate, setDlgDate] = useState<Date | null>(null);
  const [dlgKind, setDlgKind] = useState<LodgingParkDayKind>("aberto");
  const [dlgEventTag, setDlgEventTag] = useState<LodgingParkDayEventLabel | null>(null);
  const [dlgTicketLines, setDlgTicketLines] = useState<ParkTicketLine[]>([{ label: "", value: "" }]);

  useEffect(() => {
    document.title = "Calendário do parque — Gestão de reservas | Boom IA";
    return () => {
      document.title = "Boom IA — Plataforma de Agentes";
    };
  }, []);

  const gridDays = useMemo(() => {
    const start = startOfMonth(view);
    const end = endOfMonth(view);
    const gridStart = startOfWeek(start, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(end, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [view]);

  function mergedFor(isoDate: string): {
    row?: LodgingParkDay;
    kind: LodgingParkDayKind | null;
    event_label?: LodgingParkDayEventLabel | null;
    park_ticket_value?: string | null;
    dirty: boolean;
    deleted?: boolean;
  } {
    const pend = pending[isoDate];
    if (pend?.deleted) return { kind: null, event_label: null, park_ticket_value: null, dirty: true, deleted: true };
    const row = serverByDate.get(isoDate);
    if (pend)
      return {
        row,
        kind: pend.day_kind,
        event_label: pend.event_label,
        park_ticket_value: pend.park_ticket_value ?? row?.park_ticket_value ?? null,
        dirty: true,
      };
    if (row)
      return {
        row,
        kind: row.day_kind,
        event_label: row.event_label,
        park_ticket_value: row.park_ticket_value ?? null,
        dirty: false,
      };
    return { kind: null, dirty: false };
  }

  function applyBrush(d: Date) {
    if (!canEdit || !selectedTenantId || !brush) return;
    const isoD = iso(d);
    const inMonth = d.getMonth() === view.getMonth();
    if (!inMonth) return;

    const base = mergedFor(isoD);
    setPending((prev) => ({
      ...prev,
      [isoD]: {
        day_kind: brush,
        event_label: base.event_label ?? base.row?.event_label ?? null,
        park_ticket_value: base.park_ticket_value ?? base.row?.park_ticket_value ?? null,
        deleted: false,
      },
    }));
  }

  function openDlg(d: Date) {
    if (!canEdit) return;
    if (d.getMonth() !== view.getMonth()) return;
    const isoD = iso(d);
    const m = mergedFor(isoD);
    setDlgDate(d);
    setDlgKind(m.kind ?? "aberto");
    setDlgEventTag(m.event_label ?? m.row?.event_label ?? null);
    setDlgTicketLines(parseParkTicketLines(m.park_ticket_value ?? m.row?.park_ticket_value ?? null));
    setDlgOpen(true);
  }

  function saveDlg() {
    if (!dlgDate || !selectedTenantId) return;
    const isoD = iso(dlgDate);
    const serialized = serializeParkTicketLines(dlgTicketLines);
    setPending((prev) => ({
      ...prev,
      [isoD]: {
        day_kind: dlgKind,
        event_label: dlgEventTag,
        park_ticket_value: serialized,
      },
    }));
    setDlgOpen(false);
  }

  async function flushPending() {
    if (!selectedTenantId) return;
    const entries = Object.entries(pending);
    const toUpsert: Array<{
      calendar_date: string;
      day_kind: LodgingParkDayKind;
      event_label: LodgingParkDayEventLabel | null;
      park_ticket_value: string | null;
    }> = [];
    const toDeleteIds: Array<{ id: string; iso: string }> = [];

    for (const [isoD, pend] of entries) {
      if (pend.deleted) {
        const row = serverByDate.get(isoD);
        if (row?.id) toDeleteIds.push({ id: row.id, iso: isoD });
        continue;
      }
      toUpsert.push({
        calendar_date: isoD,
        day_kind: pend.day_kind,
        event_label: pend.event_label ?? null,
        park_ticket_value: pend.park_ticket_value ?? null,
      });
    }

    try {
      for (const d of toDeleteIds) {
        await delDay.mutateAsync({ id: d.id, tenant_id: selectedTenantId });
      }
      if (toUpsert.length > 0) {
        await bulkUpsert.mutateAsync({ tenant_id: selectedTenantId, days: toUpsert });
      }
      setPending({});
      toast.success("Calendário atualizado.");
      await refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar.");
    }
  }

  function deleteDayAction(isoD: string) {
    const row = serverByDate.get(isoD);
    setPending((p) => {
      const next = { ...p };
      if (row?.id && !pending[isoD]) {
        next[isoD] = {
          day_kind: "aberto",
          event_label: null,
          park_ticket_value: null,
          deleted: true,
        };
      } else if (pending[isoD]) {
        if (row?.id) next[isoD] = { ...pending[isoD], deleted: true };
        else delete next[isoD];
      }
      return next;
    });
    toast.message("Marcado para remoção — clique Guardar alterações.", { duration: 3000 });
  }

  const pendingCount = Object.keys(pending).length;

  const weekLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  return (
    <div className="-mx-4 flex min-h-[calc(100dvh-6rem)] flex-1 flex-col bg-slate-50 dark:bg-background md:-mx-6">
      <div className={cn(col, "pb-12 pt-6 md:pt-8")}>
        <header className="mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">Gestão de reservas</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-foreground sm:text-3xl">
            Calendário do parque
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-muted-foreground">
            Marque se o parque está aberto, fechado ou em manutenção, a etiqueta comercial do dia e, opcionalmente, o texto de valor
            de ingresso por data para o cliente e para o agente de IA quando integrado ao calendário.
            {scopedTenantDisplayName ? (
              <span className="block pt-2 text-[13px] text-muted-foreground">
                Tenant: <span className="font-medium text-foreground/80">{scopedTenantDisplayName}</span>
              </span>
            ) : null}
          </p>
          <HospedagemSubNav />
        </header>

        {!selectedTenantId ? (
          <div className={cn(stitchCard, "text-sm text-muted-foreground")}>Selecione um tenant para editar o calendário.</div>
        ) : (
          <>
            <section className={cn(stitchCard, "space-y-6")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <CalendarRange className="h-6 w-6" aria-hidden />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Mês de referência</h2>
                    <p className="text-xs text-muted-foreground">
                      Com pincel ativo clique no dia; sem pincel abre o formulário detalhado.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    className="h-10 w-10"
                    onClick={() => setView((v) => subMonths(v, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-slate-900 dark:text-foreground">
                    {format(view, "MMMM yyyy", { locale: ptBR })}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    className="h-10 w-10"
                    onClick={() => setView((v) => addMonths(v, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {canEdit ? (
                    <Button
                      type="button"
                      className="h-10 gap-2 bg-blue-700 hover:bg-blue-800"
                      disabled={pendingCount === 0 || bulkUpsert.isPending || delDay.isPending}
                      onClick={() => void flushPending()}
                    >
                      {(bulkUpsert.isPending || delDay.isPending) && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <Save className="h-4 w-4" />
                      Guardar alterações
                      {pendingCount > 0 ? (
                        <Badge variant="secondary" className="ml-1 rounded-md">
                          {pendingCount}
                        </Badge>
                      ) : null}
                    </Button>
                  ) : null}
                </div>
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-3">
                  <Paintbrush className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pincel</span>
                  {(Object.keys(KIND_META) as LodgingParkDayKind[]).map((k) => (
                    <Button
                      key={k}
                      type="button"
                      size="sm"
                      variant={brush === k ? "default" : "outline"}
                      className={cn("h-8 rounded-lg text-xs", brush === k ? "bg-blue-600" : "")}
                      onClick={() => setBrush((b) => (b === k ? null : k))}
                    >
                      {KIND_META[k].label}
                    </Button>
                  ))}
                  {brush ? (
                    <span className="text-xs text-muted-foreground">Ativo — clique nas datas do mês.</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Desligado.</span>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-b border-border pb-4">
                {(Object.keys(KIND_META) as LodgingParkDayKind[]).map((k) => (
                  <Badge key={k} variant="outline" className={cn("border font-medium", KIND_META[k].badge)}>
                    {KIND_META[k].label}
                  </Badge>
                ))}
              </div>

              {error ? (
                <p className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</p>
              ) : isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[640px] grid-cols-7 gap-2">
                    {weekLabels.map((w) => (
                      <div
                        key={w}
                        className="pb-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                      >
                        {w}
                      </div>
                    ))}
                    {gridDays.map((d) => {
                      const isoD = iso(d);
                      const inMonth = d.getMonth() === view.getMonth();
                      const merged = mergedFor(isoD);
                      const sunday = d.getDay() === 0;
                      const borderWeekend =
                        sunday || d.getDay() === 6 ? "opacity-95 ring-1 ring-slate-200/60 dark:ring-slate-700/80" : "";

                      if (!inMonth) {
                        return (
                          <div key={isoD} className={cn("h-24 rounded-lg bg-muted/20", borderWeekend)} />
                        );
                      }

                      const k = merged.kind;
                      const cellCls = k ? KIND_META[k].cell : "border-border bg-transparent text-muted-foreground";

                      return (
                        <button
                          key={isoD}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => (brush ? applyBrush(d) : openDlg(d))}
                          className={cn(
                            "flex h-24 flex-col rounded-lg border p-2 text-left transition hover:brightness-95 dark:hover:brightness-110",
                            borderWeekend,
                            cellCls,
                            merged.dirty && "ring-2 ring-blue-500/60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className={cn("text-sm font-semibold", !k && "text-muted-foreground")}>
                              {format(d, "d")}
                            </span>
                            {canEdit && merged.row?.id ? (
                              <button
                                type="button"
                                title="Marcar eliminação"
                                className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteDayAction(isoD);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          {merged.deleted ? (
                            <span className="mt-1 text-[10px] font-semibold text-destructive">Remover</span>
                          ) : k ? (
                            <div className="mt-1 min-h-0 flex-1 overflow-hidden">
                              <span className="line-clamp-2 text-[10px] leading-tight opacity-95">
                                {merged.event_label
                                  ? `${KIND_META[k].label} · ${EVENT_TAG_META[merged.event_label].label}`
                                  : KIND_META[k].label}
                              </span>
                              {merged.park_ticket_value ? (
                                <span className="mt-0.5 block line-clamp-2 text-[9px] font-medium text-[#374151] opacity-95 dark:text-slate-200">
                                  Ingresso: {formatParkTicketPreview(merged.park_ticket_value)}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="mt-1 text-[10px] text-muted-foreground">Sem registo</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Reservas de unidades:</strong> períodos confirmados ou pendentes bloqueiam
              a unidade nas noites cobertas (check-in inclusivo até check-out exclusivo).
            </p>
          </>
        )}

        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogContent className="max-h-[min(90dvh,720px)] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {dlgDate ? format(dlgDate, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Tipo de dia</Label>
                <Select value={dlgKind} onValueChange={(v) => setDlgKind(v as LodgingParkDayKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_META) as LodgingParkDayKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_META[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Etiqueta do dia</Label>
                <Select
                  value={dlgEventTag ?? NONE_TAG}
                  onValueChange={(v) =>
                    setDlgEventTag(v === NONE_TAG ? null : (v as LodgingParkDayEventLabel))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_TAG}>Nenhuma</SelectItem>
                    {(Object.keys(EVENT_TAG_META) as LodgingParkDayEventLabel[]).map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {EVENT_TAG_META[tag].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-2">
                  <Label>Valores de ingresso (opcional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setDlgTicketLines((rows) => [...rows, { label: "", value: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {dlgTicketLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/10 p-3 sm:flex-row sm:items-start"
                    >
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-medium text-muted-foreground">Tipo / faixa</span>
                          <Input
                            placeholder="Ex.: Inteira"
                            value={line.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDlgTicketLines((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, label: v } : r)),
                              );
                            }}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] font-medium text-muted-foreground">Valor</span>
                          <Input
                            placeholder="Ex.: R$ 120,00"
                            value={line.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDlgTicketLines((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, value: v } : r)),
                              );
                            }}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        title="Remover linha"
                        disabled={dlgTicketLines.length <= 1}
                        onClick={() =>
                          setDlgTicketLines((rows) =>
                            rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Guardado como JSON neste dia (API / agente). Texto antigo em uma linha continua a abrir num único par de
                  campos. Limite total ~{MAX_TICKET_CHARS} caracteres ao guardar.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setDlgOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" className="bg-blue-700 hover:bg-blue-800" onClick={saveDlg}>
                Aplicar à memória
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
