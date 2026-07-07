import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContacts } from "@/hooks/useContacts";
import type { Lot } from "@/hooks/useLoteamentos";
import {
  lotStatusLabel,
  useBlockLot,
  useReleaseLot,
  useReserveLot,
  useSellLot,
} from "@/hooks/useLoteamentos";
import { toast } from "sonner";

type Action = "reserve" | "sell" | "release" | "block";

export type LotActionType = Action;

type Props = {
  lot: Lot | null;
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAction?: Action;
};

export function LotActionDialog({ lot, tenantId, open, onOpenChange, initialAction }: Props) {
  const [action, setAction] = useState<Action>("reserve");
  const [contactSearch, setContactSearch] = useState("");
  const [contactId, setContactId] = useState("");
  const [reservedUntil, setReservedUntil] = useState("");
  const [notes, setNotes] = useState("");

  const { data: contactsQ, isLoading: loadingContacts } = useContacts({
    tenant_id: tenantId,
    search: contactSearch.length >= 2 ? contactSearch : undefined,
    limit: 8,
    queryEnabled: Boolean(tenantId),
  });
  const reserve = useReserveLot();
  const sell = useSellLot();
  const release = useReleaseLot();
  const block = useBlockLot();

  const pending = reserve.isPending || sell.isPending || release.isPending || block.isPending;

  useEffect(() => {
    if (!open || !lot) return;
    setContactId(lot.contact_id ?? "");
    setNotes(lot.notes ?? "");
    setReservedUntil("");
    if (initialAction) {
      setAction(initialAction);
    } else if (lot.status === "available") setAction("reserve");
    else if (lot.status === "reserved") setAction("sell");
    else if (lot.status === "blocked") setAction("release");
    else setAction("reserve");
  }, [open, lot, initialAction]);

  if (!lot) return null;

  const contacts = contactsQ?.data ?? [];

  const handleSubmit = async () => {
    if (!lot) return;
    try {
      if (action === "reserve") {
        if (!contactId) {
          toast.error("Selecione um contato para reservar.");
          return;
        }
        await reserve.mutateAsync({
          id: lot.id,
          tenant_id: tenantId,
          contact_id: contactId,
          reserved_until: reservedUntil || null,
          notes: notes || null,
        });
        toast.success("Lote reservado.");
      } else if (action === "sell") {
        if (!contactId) {
          toast.error("Selecione um contato para venda.");
          return;
        }
        await sell.mutateAsync({
          id: lot.id,
          tenant_id: tenantId,
          contact_id: contactId,
          notes: notes || null,
        });
        toast.success("Lote marcado como vendido.");
      } else if (action === "release") {
        await release.mutateAsync({ id: lot.id, tenant_id: tenantId });
        toast.success("Reserva liberada.");
      } else if (action === "block") {
        await block.mutateAsync({ id: lot.id, tenant_id: tenantId, notes: notes || null });
        toast.success("Lote bloqueado.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação.");
    }
  };

  const availableActions: { key: Action; label: string }[] = [];
  if (lot.status === "available") {
    availableActions.push({ key: "reserve", label: "Reservar" }, { key: "block", label: "Bloquear" });
  } else if (lot.status === "reserved") {
    availableActions.push(
      { key: "sell", label: "Vender" },
      { key: "release", label: "Liberar reserva" },
      { key: "block", label: "Bloquear" },
    );
  } else if (lot.status === "blocked") {
    availableActions.push({ key: "release", label: "Liberar (disponível)" });
  } else if (lot.status === "sold") {
    /* terminal — sem ações na v1 */
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Lote {lot.code} — {lotStatusLabel(lot.status)}
          </DialogTitle>
        </DialogHeader>

        {lot.status === "sold" && (
          <p className="text-sm text-muted-foreground">
            Lote vendido — status terminal. Contate um administrador para alterações manuais.
          </p>
        )}

        {availableActions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {availableActions.map((a) => (
              <Button
                key={a.key}
                type="button"
                size="sm"
                variant={action === a.key ? "default" : "outline"}
                onClick={() => setAction(a.key)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        {(action === "reserve" || action === "sell") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Buscar contato (CRM)</Label>
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Nome ou telefone…"
              />
            </div>
            {loadingContacts && contactSearch.length >= 2 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Digite ao menos 2 caracteres para buscar.</p>
                ) : (
                  contacts.map((c) => {
                    const name = c.name || "Sem nome";
                    const selected = contactId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${selected ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
                        onClick={() => setContactId(c.id)}
                      >
                        {name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
            {action === "reserve" && (
              <div className="space-y-1.5">
                <Label htmlFor="reserved-until">Validade da reserva (opcional)</Label>
                <Input
                  id="reserved-until"
                  type="date"
                  value={reservedUntil}
                  onChange={(e) => setReservedUntil(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lot-notes">Observações</Label>
          <Textarea id="lot-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending || availableActions.length === 0}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {availableActions.find((a) => a.key === action)?.label === "Vender"
              ? "Confirmar venda"
              : availableActions.find((a) => a.key === action)?.label === "Reservar"
                ? "Confirmar reserva"
                : (availableActions.find((a) => a.key === action)?.label ?? "Confirmar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
