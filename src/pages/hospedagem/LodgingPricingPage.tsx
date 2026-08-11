import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HospedagemSubNav } from "@/components/hospedagem/HospedagemSubNav";
import { useHospedagemTenantScope } from "@/hooks/useHospedagemTenantScope";
import { useEmbedHospedagemOptional } from "@/contexts/EmbedHospedagemContext";
import { cn } from "@/lib/utils";
import {
  useLodgingAccommodationTypes,
  useLodgingRates,
  useCreateLodgingRate,
  useUpdateLodgingRate,
  useDeleteLodgingRate,
  type LodgingRateItem,
} from "@/hooks/useHospedagem";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const col = "mx-auto w-full max-w-[1280px] px-5 sm:px-6 lg:px-8";
const stitchCard =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-border dark:bg-card sm:p-6";

export default function LodgingPricingPage() {
  const { selectedTenantId, scopedTenantDisplayName, canManage } = useHospedagemTenantScope();
  const isEmbed = Boolean(useEmbedHospedagemOptional()?.ready);

  const { data: typesQ } = useLodgingAccommodationTypes(selectedTenantId ?? undefined);
  const { data: ratesQ, isLoading: ratesLoading } = useLodgingRates(selectedTenantId ?? undefined);

  const createRate = useCreateLodgingRate();
  const updateRate = useUpdateLodgingRate();
  const delRate = useDeleteLodgingRate();

  const types = typesQ?.data ?? [];
  const rates = ratesQ?.data ?? [];

  // Estado do diálogo
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    accommodation_type_id: "",
    guests: "2",
    nights: "1",
    price: "",
    notes: "",
  });

  useEffect(() => {
    document.title = "Valores e tarifas — Gestão de reservas | Boom IA";
    return () => {
      document.title = "Boom IA — Plataforma de Agentes";
    };
  }, []);

  const ratesByType = useMemo(() => {
    const m = new Map<string, LodgingRateItem[]>();
    for (const r of rates) {
      const arr = m.get(r.accommodation_type_id) ?? [];
      arr.push(r);
      m.set(r.accommodation_type_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.guests - b.guests || a.nights - b.nights);
    }
    return m;
  }, [rates]);

  function openDialog(rate?: LodgingRateItem) {
    if (rate) {
      setEditingId(rate.id);
      setFormData({
        accommodation_type_id: rate.accommodation_type_id,
        guests: String(rate.guests),
        nights: String(rate.nights),
        price: String(rate.price),
        notes: rate.notes || "",
      });
    } else {
      setEditingId(null);
      setFormData({
        accommodation_type_id: types[0]?.id || "",
        guests: "2",
        nights: "1",
        price: "",
        notes: "",
      });
    }
    setDlgOpen(true);
  }

  async function handleSave() {
    if (!selectedTenantId || !formData.accommodation_type_id || !formData.price) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      if (editingId) {
        await updateRate.mutateAsync({
          id: editingId,
          tenant_id: selectedTenantId,
          patch: {
            price: parseFloat(formData.price),
            notes: formData.notes || null,
          },
        });
        toast.success("Valor atualizado.");
      } else {
        await createRate.mutateAsync({
          tenant_id: selectedTenantId,
          accommodation_type_id: formData.accommodation_type_id,
          guests: parseInt(formData.guests, 10),
          nights: parseInt(formData.nights, 10),
          price: parseFloat(formData.price),
          currency: "BRL",
          notes: formData.notes || null,
        });
        toast.success("Valor adicionado.");
      }
      setDlgOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function handleDelete(id: string) {
    if (!selectedTenantId || !window.confirm("Eliminar este valor?")) return;
    try {
      await delRate.mutateAsync({ id, tenant_id: selectedTenantId });
      toast.success("Valor eliminado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar.");
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-background",
        isEmbed ? "" : "-mx-4 md:-mx-6 min-h-[calc(100dvh-6rem)]",
      )}
    >
      <div className={cn(col, isEmbed ? "pb-10 pt-4" : "pb-12 pt-6 md:pt-8")}>
        <header className={cn("mb-2", isEmbed && "mb-4")}>
          {!isEmbed ? (
            <>
              <div className="mt-2">
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-muted-foreground">
                  Tabela de preços por <strong className="font-medium text-foreground/90">categoria de hospedagem</strong>,{" "}
                  <strong className="font-medium text-foreground/90">número de pessoas</strong> e{" "}
                  <strong className="font-medium text-foreground/90">diárias</strong>. Edite, adicione e remova valores conforme necessário.
                </p>
                {scopedTenantDisplayName ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    Tenant: <span className="font-medium text-foreground/80">{scopedTenantDisplayName}</span>
                  </p>
                ) : null}
              </div>
              <HospedagemSubNav />
            </>
          ) : (
            <p className="max-w-2xl text-[13px] leading-relaxed text-slate-500 dark:text-muted-foreground">
              Preços por categoria, número de hóspedes e quantidade de diárias.
            </p>
          )}
        </header>

        {!selectedTenantId ? (
          <div className={cn(stitchCard, "mt-8 text-sm text-muted-foreground")}>
            Selecione um tenant para gerir valores de hospedagem.
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {canManage && (
              <Button onClick={() => openDialog()} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar valor
              </Button>
            )}

            {ratesLoading ? (
              <div className={cn(stitchCard, "flex items-center justify-center gap-2 py-8")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando valores...</span>
              </div>
            ) : rates.length === 0 ? (
              <div className={cn(stitchCard, "py-8 text-center text-sm text-muted-foreground")}>
                Sem valores cadastrados. Adicione o primeiro valor para começar.
              </div>
            ) : (
              Array.from(ratesByType.entries()).map(([typeId, typeRates]) => {
                const typeName = types.find((t) => t.id === typeId)?.name || typeId;
                return (
                  <div key={typeId} className="space-y-3">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">{typeName}</h3>
                    <div className={stitchCard}>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr>
                              <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">Pessoas</th>
                              <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">Noites</th>
                              <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">Valor (R$)</th>
                              <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">Notas</th>
                              {canManage && (
                                <th className="border-b border-border bg-muted/50 px-3 py-2 text-right font-semibold">Ações</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {typeRates.map((r) => (
                              <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-3 py-2">{r.guests}</td>
                                <td className="px-3 py-2">{r.nights}</td>
                                <td className="px-3 py-2 font-medium text-emerald-700 dark:text-emerald-400">
                                  {r.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </td>
                                <td className="px-3 py-2 max-w-xs truncate text-xs text-muted-foreground">{r.notes || "—"}</td>
                                {canManage && (
                                  <td className="px-3 py-2 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDialog(r)}>
                                        Editar
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-destructive"
                                        onClick={() => handleDelete(r.id)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar valor" : "Adicionar novo valor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingId && (
              <>
                <div>
                  <Label htmlFor="type">Acomodação</Label>
                  <Select value={formData.accommodation_type_id} onValueChange={(v) => setFormData({ ...formData, accommodation_type_id: v })}>
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="guests">Pessoas</Label>
                    <Input
                      id="guests"
                      type="number"
                      min="1"
                      value={formData.guests}
                      onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="nights">Noites</Label>
                    <Input
                      id="nights"
                      type="number"
                      min="1"
                      value={formData.nights}
                      onChange={(e) => setFormData({ ...formData, nights: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <Label htmlFor="price">Valor (R$)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Input
                id="notes"
                placeholder="Ex.: Não válido para datas especiais"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={createRate.isPending || updateRate.isPending}>
              {createRate.isPending || updateRate.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
