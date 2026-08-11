import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  Car,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOccurrences } from "@/hooks/useOccurrences";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useModuleActions } from "@/hooks/useModuleActions";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateOccurrenceDialog } from "@/components/occurrences/CreateOccurrenceDialog";
import { EditOccurrenceDialog } from "@/components/occurrences/EditOccurrenceDialog";
import { DeleteOccurrenceDialog } from "@/components/occurrences/DeleteOccurrenceDialog";
import type {
  Occurrence,
  OccurrenceContactSummary,
  OccurrenceInventorySummary,
  OccurrenceSeverity,
  OccurrenceStatus,
} from "@/types/database";
import { OCCURRENCE_LOCATION_LABELS } from "@/lib/occurrence-locations";
import { cn } from "@/lib/utils";
import { callAPI } from "@/lib/api-client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Abre o cadastro do CRM no separador Faturas (compra / registo financeiro). */
function contactProfilePurchaseHref(contactId: string): string {
  return `/contacts/${contactId}?tab=invoices`;
}

function occurrenceVehicle(occ: Occurrence): OccurrenceInventorySummary | null {
  const inv = occ.inventory;
  if (!inv) return null;
  return Array.isArray(inv) ? inv[0] ?? null : inv;
}

function vehiclePhoto(inv: OccurrenceInventorySummary | null): string | null {
  if (!inv?.photo_url) return null;
  return inv.photo_url;
}

function occurrenceContact(occ: Occurrence): OccurrenceContactSummary | null {
  const c = occ.contacts;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

/** Foto registada na ocorrência ou, em alternativa, foto do veículo. */
function occurrenceListPhoto(occ: Occurrence, inv: OccurrenceInventorySummary | null): string | null {
  const urls = Array.isArray(occ.photo_urls) ? occ.photo_urls : [];
  const first = urls.find((u) => u.trim());
  if (first) return first.trim();
  return vehiclePhoto(inv);
}

function statusLabel(s: OccurrenceStatus): string {
  switch (s) {
    case "aberta":
      return "Aberta";
    case "em_andamento":
      return "Em andamento";
    case "resolvida":
      return "Resolvida";
    case "cancelada":
      return "Cancelada";
    default:
      return s;
  }
}

function severityLabel(sev: OccurrenceSeverity): string {
  switch (sev) {
    case "baixa":
      return "Baixa";
    case "media":
      return "Média";
    case "alta":
      return "Alta";
    case "critica":
      return "Crítica";
    default:
      return sev;
  }
}

function statusBadgeVariant(s: OccurrenceStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "resolvida") return "secondary";
  if (s === "cancelada") return "outline";
  if (s === "em_andamento") return "default";
  return "outline";
}

function severityBadgeClass(sev: OccurrenceSeverity): string {
  if (sev === "critica") return "border-destructive/60 bg-destructive/10 text-destructive";
  if (sev === "alta") return "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (sev === "media") return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return "border-muted-foreground/30 bg-muted/50 text-muted-foreground";
}

function occurrenceLocationSummary(occ: Occurrence): string {
  const raw = occ.location_type;
  const key =
    raw && raw in OCCURRENCE_LOCATION_LABELS ? (raw as keyof typeof OCCURRENCE_LOCATION_LABELS) : "loja";
  const label = OCCURRENCE_LOCATION_LABELS[key];
  const detail = occ.location_detail?.trim();
  if (key === "outro" && detail) return `${label}: ${detail}`;
  if (detail) return `${label} — ${detail}`;
  return label;
}

function formatOdometerKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  return `${km.toLocaleString("pt-BR")} km`;
}

export default function OccurrencesPage() {
  const queryClient = useQueryClient();
  const { selectedTenantId } = useTenantContext();
  const { isSuperAdmin } = useAuth();
  const { can } = useModuleActions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOcc, setEditOcc] = useState<Occurrence | null>(null);
  const [deleteOcc, setDeleteOcc] = useState<Occurrence | null>(null);
  const [sellOcc, setSellOcc] = useState<Occurrence | null>(null);
  const [sellBusy, setSellBusy] = useState(false);

  const canRegister = can("occurrences", "register");
  const canEdit = can("occurrences", "edit");
  const canDelete = can("occurrences", "delete");

  const listParams = useMemo(
    () => ({
      tenant_id: selectedTenantId ?? undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      severity: severityFilter === "all" ? undefined : severityFilter,
      search: search.trim() || undefined,
      limit: 100,
      offset: 0,
    }),
    [selectedTenantId, statusFilter, severityFilter, search]
  );

  const { data, isLoading, error } = useOccurrences(listParams);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const confirmMarkVehicleSold = async () => {
    if (!sellOcc?.contact_id) return;
    const inv = occurrenceVehicle(sellOcc);
    if (!inv) return;
    const cid = sellOcc.contact_id;
    const vehicleLabel = [inv.brand, inv.model, inv.version].filter(Boolean).join(" ");
    const yearPart = inv.year != null ? `, ${inv.year}` : "";
    const desc = `Compra de veículo (${vehicleLabel}${yearPart}). Ocorrência: ${sellOcc.title.trim()}`;
    const rawPrice = inv.price != null ? Number(inv.price) : NaN;
    const amount = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0.01;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    setSellBusy(true);
    try {
      await callAPI(`/crm-contacts/${cid}/invoices`, {
        method: "POST",
        body: {
          amount,
          due_date: today,
          status: "paid",
          paid_at: now,
          description: desc,
          metadata: {
            source: "occurrence_vehicle_sale",
            inventory_id: sellOcc.inventory_id,
            occurrence_id: sellOcc.id,
          },
        },
      });
      await callAPI(`/crm-contacts/${cid}`, {
        method: "PATCH",
        body: { contact_type: "client" },
      });
      await callAPI(`/inventory/${sellOcc.inventory_id}`, {
        method: "PATCH",
        body: { status: "sold" },
      });
      toast.success("Venda registada: fatura no cadastro do cliente e veículo marcado como vendido.");
      queryClient.invalidateQueries({ queryKey: ["occurrences"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["crm-contacts", cid, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["crm-contacts", cid, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
      setSellOcc(null);
    } catch (err: unknown) {
      toast.error("Não foi possível concluir: " + (err instanceof Error ? err.message : "erro"));
    } finally {
      setSellBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-x-3">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{total} registo(s)</span>
        </div>
        {canRegister && (
          <Button
            className="gap-2 shrink-0"
            onClick={() => setCreateOpen(true)}
            disabled={!selectedTenantId}
            title={!selectedTenantId ? "Selecione um tenant para criar ocorrências" : undefined}
          >
            <Plus className="h-4 w-4" />
            Nova ocorrência
          </Button>
        )}
      </div>

      {!selectedTenantId && !isSuperAdmin && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-card p-4">
          Selecione um tenant no menu superior para ver ocorrências.
        </p>
      )}

      {isSuperAdmin && !selectedTenantId && (
        <p className="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          Superadmin: sem tenant selecionado, a lista mostra ocorrências de todos os tenants.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-0 max-w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar no título ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 bg-background pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="aberta">Aberta</SelectItem>
            <SelectItem value="em_andamento">Em andamento</SelectItem>
            <SelectItem value="resolvida">Resolvida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</p>
      )}

      {/* Mobile: cards */}
      <div className="md:hidden space-y-3">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        {!isLoading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma ocorrência encontrada.</p>
            {canRegister && selectedTenantId && (
              <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                Criar primeira ocorrência
              </Button>
            )}
          </div>
        )}
        {items.map((occ) => {
          const inv = occurrenceVehicle(occ);
          const photo = occurrenceListPhoto(occ, inv);
          const client = occurrenceContact(occ);
          const vehicleName = inv ? [inv.brand, inv.model, inv.version].filter(Boolean).join(" ") : "—";
          const canRegistarVenda = Boolean(canRegister && occ.contact_id && inv && inv.status !== "sold");
          return (
            <div
              key={occ.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
            >
              <div className="flex gap-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {photo ? (
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Car className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground leading-snug line-clamp-2">{occ.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{vehicleName}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatWhen(occ.occurred_at)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {occurrenceLocationSummary(occ)}
                    {formatOdometerKm(occ.odometer_km) ? ` · ${formatOdometerKm(occ.odometer_km)}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusBadgeVariant(occ.status)} className="text-[10px]">
                  {statusLabel(occ.status)}
                </Badge>
                <Badge variant="outline" className={cn("text-[10px]", severityBadgeClass(occ.severity))}>
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {severityLabel(occ.severity)}
                </Badge>
              </div>
              {occ.description && (
                <p className="text-xs text-muted-foreground line-clamp-3">{occ.description}</p>
              )}
              {client && occ.contact_id && (
                <p className="text-xs text-muted-foreground">
                  Cliente:{" "}
                  <Link
                    to={contactProfilePurchaseHref(occ.contact_id)}
                    className="font-medium text-primary hover:underline"
                  >
                    {client.name}
                  </Link>
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
                {occ.contact_id && (
                  <Button variant="ghost" size="sm" className="h-8 px-2" asChild>
                    <Link to={contactProfilePurchaseHref(occ.contact_id)}>
                      <User className="h-4 w-4 mr-1" />
                      Cliente / compra
                    </Link>
                  </Button>
                )}
                {canRegistarVenda && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-success"
                    onClick={() => setSellOcc(occ)}
                  >
                    <BadgeCheck className="h-4 w-4 mr-1" />
                    Registar venda
                  </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditOcc(occ)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => setDeleteOcc(occ)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remover
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <div className="-mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Veículo</th>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Ocorrência</th>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Quando</th>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Local / km</th>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-normal text-muted-foreground">Severidade</th>
                    <th className="relative px-4 py-3"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7} className="px-4 py-4">
                          <Skeleton className="h-12 w-full" />
                        </td>
                      </tr>
                    ))}
                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Nenhuma ocorrência encontrada.
                      </td>
                    </tr>
                  )}
                  {items.map((occ) => {
                    const inv = occurrenceVehicle(occ);
                    const photo = occurrenceListPhoto(occ, inv);
                    const vehicleName = inv ? [inv.brand, inv.model, inv.version].filter(Boolean).join(" ") : "—";
                    const canRegistarVenda = Boolean(canRegister && occ.contact_id && inv && inv.status !== "sold");
                    return (
                      <tr key={occ.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">
                              {photo ? (
                                <img src={photo} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Car className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="text-sm text-foreground max-w-[200px] truncate">{vehicleName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-foreground max-w-xs truncate">{occ.title}</div>
                          {occ.description && (
                            <div className="text-xs text-muted-foreground max-w-xs truncate">{occ.description}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {formatWhen(occ.occurred_at)}
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-xs text-muted-foreground">
                          <div className="line-clamp-2">{occurrenceLocationSummary(occ)}</div>
                          {formatOdometerKm(occ.odometer_km) && (
                            <div className="mt-0.5 text-foreground">{formatOdometerKm(occ.odometer_km)}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant={statusBadgeVariant(occ.status)} className="text-[10px]">
                            {statusLabel(occ.status)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px]", severityBadgeClass(occ.severity))}>
                            {severityLabel(occ.severity)}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-1">
                            {occ.contact_id && (
                              <Link
                                to={contactProfilePurchaseHref(occ.contact_id)}
                                className="p-2 text-muted-foreground hover:text-primary"
                                title="Abrir cadastro do cliente (faturas / compra)"
                              >
                                <User className="h-4 w-4" />
                              </Link>
                            )}
                            {canRegistarVenda && (
                              <button
                                type="button"
                                className="p-2 text-muted-foreground hover:text-success"
                                title="Registar venda para o cliente vinculado"
                                onClick={() => setSellOcc(occ)}
                              >
                                <BadgeCheck className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="p-2 text-muted-foreground hover:text-primary"
                                title="Editar"
                                onClick={() => setEditOcc(occ)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="p-2 text-muted-foreground hover:text-destructive"
                                title="Remover"
                                onClick={() => setDeleteOcc(occ)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={!!sellOcc} onOpenChange={(open) => !open && !sellBusy && setSellOcc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registar venda para o cliente vinculado?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Será criada uma <strong className="text-foreground">fatura paga</strong> no cadastro do cliente
                  (separador Faturas), com o valor do anúncio do veículo ou R$ 0,01 se não houver preço — pode editar
                  depois no perfil do contacto.
                </p>
                <p>
                  O contacto passa a <strong className="text-foreground">cliente</strong> e o veículo do inventário
                  fica <strong className="text-foreground">vendido</strong>.
                </p>
                {sellOcc ? (
                  <ul className="list-disc pl-4 text-xs">
                    <li>
                      Veículo:{" "}
                      {[occurrenceVehicle(sellOcc)?.brand, occurrenceVehicle(sellOcc)?.model].filter(Boolean).join(" ") ||
                        "—"}
                    </li>
                    <li>Cliente: {occurrenceContact(sellOcc)?.name ?? "—"}</li>
                  </ul>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sellBusy}>Cancelar</AlertDialogCancel>
            <Button type="button" disabled={sellBusy} onClick={() => void confirmMarkVehicleSold()}>
              {sellBusy ? "A processar…" : "Confirmar venda"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateOccurrenceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditOccurrenceDialog
        occurrence={editOcc}
        open={!!editOcc}
        onOpenChange={(o) => !o && setEditOcc(null)}
      />
      <DeleteOccurrenceDialog
        occurrence={deleteOcc}
        open={!!deleteOcc}
        onOpenChange={(o) => !o && setDeleteOcc(null)}
      />
    </div>
  );
}
