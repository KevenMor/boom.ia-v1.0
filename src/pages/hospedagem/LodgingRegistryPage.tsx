import { useEffect, useMemo, useState } from "react";
import { BedDouble, ChevronDown, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HospedagemSubNav } from "@/components/hospedagem/HospedagemSubNav";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  useCreateAccommodationType,
  useCreateLodgingReservation,
  useCreateLodgingUnit,
  useDeleteAccommodationType,
  useDeleteLodgingReservation,
  useDeleteLodgingUnit,
  useLodgingAccommodationTypes,
  useLodgingAvailability,
  useLodgingReservations,
  useLodgingUnits,
  useUpdateLodgingReservation,
  useUpdateLodgingUnit,
  type LodgingAccommodationType,
  type LodgingReservation,
  type LodgingUnit,
} from "@/hooks/useHospedagem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";
const stitchCard =
  "rounded-xl border border-[#ccc3d8] bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6";

function resStatusBadge(s: string) {
  if (s === "confirmed") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30";
  if (s === "pending") return "bg-amber-500/15 text-amber-900 dark:text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

/** API devolve datas `YYYY-MM-DD`; exibir sempre no padrão brasileiro. */
function formatDateBRCalendar(ymd: string): string {
  const s = typeof ymd === "string" ? ymd.trim().slice(0, 10) : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return ymd ?? "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function resStatusLabel(s: string): string {
  if (s === "confirmed") return "Confirmada";
  if (s === "pending") return "Pendente";
  if (s === "cancelled") return "Cancelada";
  return s;
}

export default function LodgingRegistryPage() {
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();
  const canManage = Boolean(selectedTenantId && (isSuperAdmin || isTenantAdmin(selectedTenantId)));

  const { data: typesQ } = useLodgingAccommodationTypes(selectedTenantId ?? undefined);
  const { data: unitsQ } = useLodgingUnits(selectedTenantId ?? undefined);
  const { data: resvQ } = useLodgingReservations(selectedTenantId ?? undefined);

  const createType = useCreateAccommodationType();
  const delType = useDeleteAccommodationType();
  const createUnit = useCreateLodgingUnit();
  const updateUnit = useUpdateLodgingUnit();
  const delUnit = useDeleteLodgingUnit();
  const createRes = useCreateLodgingReservation();
  const updateRes = useUpdateLodgingReservation();
  const delRes = useDeleteLodgingReservation();

  const types = typesQ?.data ?? [];
  const units = unitsQ?.data ?? [];
  const reservations = resvQ?.data ?? [];

  const unitsByType = useMemo(() => {
    const m = new Map<string, LodgingUnit[]>();
    for (const u of units) {
      const arr = m.get(u.accommodation_type_id) ?? [];
      arr.push(u);
      m.set(u.accommodation_type_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return m;
  }, [units]);

  const stockStats = useMemo(() => {
    const active = units.filter((u) => u.status === "active").length;
    const inactive = units.filter((u) => u.status === "inactive").length;
    return { categories: types.length, active, inactive, total: units.length };
  }, [types.length, units]);

  const [newTypeName, setNewTypeName] = useState("");

  const [unitDlg, setUnitDlg] = useState<{ type: LodgingAccommodationType | null }>({ type: null });
  const [unitName, setUnitName] = useState("");
  const [unitNotes, setUnitNotes] = useState("");

  const [resDlgOpen, setResDlgOpen] = useState(false);
  const [resCheckIn, setResCheckIn] = useState("");
  const [resCheckOut, setResCheckOut] = useState("");
  const [resUnitId, setResUnitId] = useState("");
  const [resContactId, setResContactId] = useState("");
  const [resNotes, setResNotes] = useState("");
  const [resStatus, setResStatus] = useState<"pending" | "confirmed" | "cancelled">("pending");

  const { data: availQ } = useLodgingAvailability(selectedTenantId ?? undefined, resCheckIn, resCheckOut);

  useEffect(() => {
    document.title = "Estoque de quartos — Gestão de reservas | Boom IA";
    return () => {
      document.title = "Boom IA — Plataforma de Agentes";
    };
  }, []);

  async function handleCreateType() {
    if (!selectedTenantId || !newTypeName.trim()) return;
    try {
      await createType.mutateAsync({ tenant_id: selectedTenantId, name: newTypeName.trim() });
      toast.success("Categoria criada.");
      setNewTypeName("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function openNewUnit(type: LodgingAccommodationType) {
    setUnitDlg({ type });
    setUnitName("");
    setUnitNotes("");
  }

  async function saveNewUnit() {
    if (!selectedTenantId || !unitDlg.type || !unitName.trim()) return;
    try {
      await createUnit.mutateAsync({
        tenant_id: selectedTenantId,
        accommodation_type_id: unitDlg.type.id,
        name: unitName.trim(),
        notes: unitNotes.trim() || null,
      });
      toast.success("Unidade criada.");
      setUnitDlg({ type: null });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function toggleUnitActive(u: LodgingUnit) {
    if (!selectedTenantId || !canManage) return;
    const next = u.status === "active" ? "inactive" : "active";
    try {
      await updateUnit.mutateAsync({ id: u.id, tenant_id: selectedTenantId, patch: { status: next } });
      toast.success(next === "active" ? "Unidade ativada." : "Unidade desativada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function removeUnit(u: LodgingUnit) {
    if (!selectedTenantId || !canManage) return;
    if (!window.confirm(`Eliminar a unidade «${u.name}»? Se existirem reservas, poderá falhar.`)) return;
    try {
      await delUnit.mutateAsync({ id: u.id, tenant_id: selectedTenantId });
      toast.success("Unidade eliminada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro — verifique reservas.");
    }
  }

  async function removeType(t: LodgingAccommodationType) {
    if (!selectedTenantId || !canManage) return;
    if (!window.confirm(`Eliminar «${t.name}» e todas as suas unidades?`)) return;
    try {
      await delType.mutateAsync({ id: t.id, tenant_id: selectedTenantId });
      toast.success("Categoria eliminada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function saveReservation() {
    if (!selectedTenantId || !resUnitId || !resCheckIn || !resCheckOut) return;
    if (resCheckOut <= resCheckIn) {
      toast.error("Check-out tem de ser posterior ao check-in.");
      return;
    }
    try {
      await createRes.mutateAsync({
        tenant_id: selectedTenantId,
        unit_id: resUnitId,
        check_in: resCheckIn,
        check_out: resCheckOut,
        status: resStatus,
        notes: resNotes.trim() || null,
        contact_id: resContactId.trim() || null,
      });
      toast.success("Reserva criada.");
      setResDlgOpen(false);
      setResUnitId("");
      setResNotes("");
      setResContactId("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Possível conflito de período ou erro no servidor.");
    }
  }

  async function patchResStatus(res: LodgingReservation, status: LodgingReservation["status"]) {
    if (!selectedTenantId) return;
    try {
      await updateRes.mutateAsync({ id: res.id, tenant_id: selectedTenantId, patch: { status } });
      toast.success("Reserva atualizada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function removeRes(res: LodgingReservation) {
    if (!selectedTenantId || !canManage) return;
    if (!window.confirm("Eliminar esta reserva?")) return;
    try {
      await delRes.mutateAsync({ id: res.id, tenant_id: selectedTenantId });
      toast.success("Reserva eliminada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="-mx-4 flex min-h-[calc(100dvh-6rem)] flex-1 flex-col bg-[#f8f9ff] dark:bg-background md:-mx-6">
      <div className={cn(col, "pb-12 pt-6 md:pt-8")}>
        <header className="mb-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#630ed4]">Gestão de reservas</p>
          <div className="mt-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0b1c30] dark:text-foreground sm:text-3xl">
              Estoque de quartos no parque
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4a4455] dark:text-muted-foreground">
              Aqui registra <strong className="font-medium text-foreground/90">o que existe fisicamente</strong>: tipo de hospedagem (categoria) e cada quarto/unidade disponível ou desativado. Serve como inventário para a equipe e base para ferramentas de disponibilidade. Marcar reservas e períodos ocupados é um passo opcional no fim da página quando precisarem bloquear datas.
            </p>
            {scopedTenantDisplayName ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Tenant: <span className="font-medium text-foreground/80">{scopedTenantDisplayName}</span>
              </p>
            ) : null}
          </div>
          <HospedagemSubNav />
        </header>

        {!selectedTenantId ? (
          <div className={cn(stitchCard, "text-sm text-muted-foreground")}>Selecione um tenant para gerir o estoque de quartos.</div>
        ) : (
          <div className="space-y-8">
            <section className={cn(stitchCard, "flex flex-col gap-4 border-[#6314d926] bg-[#faf8ff] sm:flex-row sm:items-stretch sm:gap-6 dark:border-border dark:bg-muted/20")}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-xl bg-[#7c3aed]/15 text-[#630ed4] dark:bg-[#7c3aed]/25 dark:text-[#c4b5fd] sm:self-center">
                <Package className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-[#0b1c30] dark:text-foreground">Visão rápida do estoque</h2>
                {stockStats.categories === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Ainda não há categorias registradas.</p>
                ) : (
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-[#e8e4f5] bg-white/70 px-3 py-2.5 dark:border-border dark:bg-card/60">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorias</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#0b1c30] dark:text-foreground">
                        {stockStats.categories}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-[#e8e4f5] bg-white/70 px-3 py-2.5 dark:border-border dark:bg-card/60">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quartos ativos</dt>
                      <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
                        {stockStats.active}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-[#e8e4f5] bg-white/70 px-3 py-2.5 dark:border-border dark:bg-card/60">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desativados</dt>
                      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xl font-semibold tabular-nums tracking-tight text-muted-foreground">
                        {stockStats.inactive}
                        {stockStats.total > 0 ? (
                          <span className="text-xs font-normal normal-case text-muted-foreground">({stockStats.total} unid. total)</span>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </section>

            <section className={cn(stitchCard, "space-y-4")}>
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-[#0b1c30] dark:text-foreground">
                  <BedDouble className="h-5 w-5 text-[#630ed4]" aria-hidden /> Nova categoria de hospedagem
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agrupa tipos de quarto físicos iguais (ex.: Suíte Luxo, Chalé). Depois pode adicionar cada unidade com o nome ou número da porta.
                </p>
              </div>
              {canManage ? (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="new-category-name" className="text-sm">
                      Nome da categoria
                    </Label>
                    <Input
                      id="new-category-name"
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      className="h-10 w-full max-w-xl"
                      placeholder="Ex.: Suíte Luxo, Chalé…"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={createType.isPending || !newTypeName.trim()}
                    className="h-10 w-full shrink-0 bg-[#630ed4] hover:bg-[#6d28d9] sm:w-auto sm:min-w-[7.5rem]"
                    onClick={() => void handleCreateType()}
                  >
                    {createType.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Adicionar
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Necessário tenant admin ou superadmin.</p>
              )}
            </section>

            {types.length === 0 ? (
              <div className={cn(stitchCard, "text-center text-sm text-muted-foreground")}>
                Sem categorias no estoque. Crie uma acima para começar a listar quartos.
              </div>
            ) : (
              types.map((t) => (
                <Collapsible key={t.id} defaultOpen className={cn(stitchCard, "!overflow-hidden !p-0")}>
                  <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-start hover:bg-muted/40 sm:px-6">
                    <div className="min-w-0">
                      <span className="text-base font-semibold text-[#0b1c30] dark:text-foreground">{t.name}</span>
                      {t.max_occupancy ? (
                        <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">até {t.max_occupancy} p.</span>
                      ) : null}
                    </div>
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border">
                    <div className="space-y-3 px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-center gap-2">
                        {canManage ? (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => openNewUnit(t)}>
                              <Plus className="mr-2 h-3.5 w-3.5" /> Adicionar quarto
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void removeType(t)}>
                              Eliminar categoria
                            </Button>
                          </>
                        ) : null}
                      </div>
                      <UnitsTable
                        rows={unitsByType.get(t.id) ?? []}
                        canManage={canManage}
                        onToggle={(u) => void toggleUnitActive(u)}
                        onDelete={(u) => void removeUnit(u)}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}

            <Collapsible defaultOpen={false} className={cn(stitchCard, "!overflow-hidden border-dashed !p-0 dark:opacity-100")}>
              <CollapsibleTrigger className="group flex w-full items-start justify-between gap-4 px-5 py-4 text-start hover:bg-muted/30 sm:items-center sm:px-6">
                <div className="min-w-0">
                  <span className="text-base font-semibold text-[#0b1c30] dark:text-foreground">Reservas e períodos ocupados</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Secção opcional. Reservas pendentes ou confirmadas bloqueiam a unidade em [check-in, check-out).
                  </p>
                </div>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border">
                <div className="space-y-4 px-5 py-4 sm:px-6">
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          setResCheckIn("");
                          setResCheckOut("");
                          setResUnitId("");
                          setResContactId("");
                          setResNotes("");
                          setResStatus("pending");
                          setResDlgOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Nova reserva
                      </Button>
                    </div>
                  ) : null}

                  {reservations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem reservas registradas.</p>
                  ) : (
                    <div className="-mx-1 overflow-x-auto px-1">
                      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="pb-3 pl-0 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
                              Unidade
                            </th>
                            <th className="w-[104px] pb-3 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
                              Entrada
                            </th>
                            <th className="w-[104px] pb-3 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
                              Saída
                            </th>
                            <th className="w-[120px] pb-3 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
                              Estado
                            </th>
                            <th className="min-w-0 pb-3 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
                              Contacto
                            </th>
                            <th className="w-[200px] pb-3 pr-0 text-right align-bottom text-xs font-semibold uppercase tracking-wide">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservations.map((r) => (
                            <tr key={r.id} className="border-b border-border/70">
                              <td className="max-w-[1px] py-3 pl-0 pr-3 align-middle">
                                <span className="block truncate font-medium" title={r.lodging_units?.name ?? r.unit_id}>
                                  {r.lodging_units?.name ?? r.unit_id}
                                </span>
                              </td>
                              <td className="py-3 pr-3 align-middle font-tabular-nums tracking-tight text-muted-foreground">
                                {formatDateBRCalendar(r.check_in)}
                              </td>
                              <td className="py-3 pr-3 align-middle font-tabular-nums tracking-tight text-muted-foreground">
                                {formatDateBRCalendar(r.check_out)}
                              </td>
                              <td className="py-3 pr-3 align-middle">
                                <Badge variant="outline" className={cn("font-normal", resStatusBadge(r.status))}>
                                  {resStatusLabel(r.status)}
                                </Badge>
                              </td>
                              <td className="max-w-[1px] py-3 pr-3 align-middle">
                                <span className="block truncate text-muted-foreground" title={r.contacts?.name ?? ""}>
                                  {r.contacts?.name ?? "—"}
                                </span>
                              </td>
                              <td className="py-3 pr-0 text-right align-middle">
                                {canManage ? (
                                  <div className="flex flex-wrap items-center justify-end gap-1">
                                    {r.status !== "confirmed" ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        type="button"
                                        className="h-8"
                                        onClick={() => void patchResStatus(r, "confirmed")}
                                      >
                                        Confirmar
                                      </Button>
                                    ) : null}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      type="button"
                                      className="h-8"
                                      onClick={() => void patchResStatus(r, "cancelled")}
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      type="button"
                                      className="h-8 w-8 shrink-0 text-destructive"
                                      onClick={() => void removeRes(r)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>

      <Dialog open={Boolean(unitDlg.type)} onOpenChange={(o) => !o && setUnitDlg({ type: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unidade · {unitDlg.type?.name ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <Label>Nome ou identificador do quarto</Label>
            <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} />
            <Label>Observações</Label>
            <Textarea rows={3} value={unitNotes} onChange={(e) => setUnitNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setUnitDlg({ type: null })}>Cancelar</Button>
            <Button className="bg-[#630ed4]" type="button" disabled={createUnit.isPending} onClick={() => void saveNewUnit()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resDlgOpen} onOpenChange={setResDlgOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova reserva (bloqueio de período)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Check-in</Label>
              <Input type="date" value={resCheckIn} onChange={(e) => setResCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Check-out</Label>
              <Input type="date" value={resCheckOut} onChange={(e) => setResCheckOut(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Estado</Label>
              <Select value={resStatus} onValueChange={(v) => setResStatus(v as typeof resStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Unidade</Label>
              <Select value={resUnitId ? resUnitId : "none"} onValueChange={(v) => setResUnitId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {units.filter((u) => u.status === "active").map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {(u.lodging_accommodation_types?.name ?? "")}: {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availQ?.units && resUnitId ? (
                <p className="text-xs">
                  Disponível no período:{" "}
                  <span className={availQ.units.find((x) => x.unit_id === resUnitId)?.available ? "text-emerald-600" : "text-destructive"}>
                    {availQ.units.find((x) => x.unit_id === resUnitId)?.available ? "Sim" : "Não"}
                  </span>
                </p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-muted-foreground">Contacto UUID (opcional)</Label>
              <Input value={resContactId} onChange={(e) => setResContactId(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={3} value={resNotes} onChange={(e) => setResNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setResDlgOpen(false)}>Cancelar</Button>
            <Button className="bg-[#630ed4]" type="button" disabled={createRes.isPending} onClick={() => void saveReservation()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnitsTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: LodgingUnit[];
  canManage: boolean;
  onToggle: (u: LodgingUnit) => void;
  onDelete: (u: LodgingUnit) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum quarto nesta categoria. Use &quot;Adicionar quarto&quot;.</p>;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="pb-2 pl-0 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
              Quarto / unidade
            </th>
            <th className="w-[160px] pb-2 pr-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide">
              Estado no estoque
            </th>
            <th className="w-[200px] pb-2 pr-0 text-right align-bottom text-xs font-semibold uppercase tracking-wide">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-border/70">
              <td className="max-w-[1px] py-3 pl-0 pr-3 align-middle">
                <span className="block truncate font-medium">{u.name}</span>
              </td>
              <td className="py-3 pr-3 align-middle">
                {u.status === "active" ? (
                  <span className="text-emerald-700 dark:text-emerald-400">No parque (ativo)</span>
                ) : (
                  <span className="text-muted-foreground">Desativado</span>
                )}
              </td>
              <td className="py-3 pr-0 align-middle">
                {canManage ? (
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onToggle(u)}>
                      {u.status === "active" ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive"
                      onClick={() => onDelete(u)}
                    >
                      Eliminar
                    </Button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
