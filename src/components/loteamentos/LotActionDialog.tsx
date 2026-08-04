import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Mail, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContacts } from "@/hooks/useContacts";
import type { Contact } from "@/types/database";
import type { Lot } from "@/hooks/useLoteamentos";
import {
  lotStatusLabel,
  useBlockLot,
  useReleaseLot,
  useReserveLot,
  useSellLot,
} from "@/hooks/useLoteamentos";
import { cn } from "@/lib/utils";
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

function contactPhones(c: Contact): string[] {
  const out: string[] = [];
  if (c.phone?.trim()) out.push(c.phone.trim());
  const meta = c.metadata as { phone2?: string; phones?: unknown } | null | undefined;
  if (meta?.phone2?.trim()) out.push(meta.phone2.trim());
  if (Array.isArray(meta?.phones)) {
    for (const p of meta.phones) {
      if (typeof p === "string" && p.trim()) out.push(p.trim());
    }
  }
  return [...new Set(out)];
}

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
  const contacts = contactsQ?.data ?? [];

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId) ?? null,
    [contacts, contactId],
  );
  const linkedContactLabel = lot?.contacts?.name ?? null;

  useEffect(() => {
    if (!open || !lot) return;
    setContactId(lot.contact_id ?? "");
    setNotes(lot.notes ?? "");
    setReservedUntil("");
    setContactSearch("");
    if (initialAction) {
      setAction(initialAction);
    } else if (lot.status === "available") setAction("reserve");
    else if (lot.status === "reserved") setAction("sell");
    else if (lot.status === "blocked") setAction("release");
    else setAction("reserve");
  }, [open, lot, initialAction]);

  if (!lot) return null;

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
  }

  const confirmLabel =
    availableActions.find((a) => a.key === action)?.label === "Vender"
      ? "Confirmar venda"
      : availableActions.find((a) => a.key === action)?.label === "Reservar"
        ? "Confirmar reserva"
        : (availableActions.find((a) => a.key === action)?.label ?? "Confirmar");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* handle visual mobile */}
        <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden />

        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            Lote {lot.code} — {lotStatusLabel(lot.status)}
          </DialogTitle>
        </DialogHeader>

        {lot.status === "sold" && (
          <p className="text-sm text-muted-foreground">
            Lote vendido — status terminal. Contate um administrador para alterações manuais.
          </p>
        )}

        {availableActions.length > 1 && (
          <div
            className={cn(
              "grid gap-2",
              availableActions.length === 2 && "grid-cols-2",
              availableActions.length >= 3 && "grid-cols-1 sm:grid-cols-3",
            )}
          >
            {availableActions.map((a) => (
              <Button
                key={a.key}
                type="button"
                size="default"
                className="min-h-11 touch-manipulation"
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
              <Label htmlFor="lot-contact-search">Buscar contato (CRM)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lot-contact-search"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Nome ou telefone…"
                  className="h-11 pl-9 text-base sm:text-sm"
                  autoComplete="off"
                  inputMode="search"
                />
              </div>
            </div>

            {selectedContact ? (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedContact.name || "Sem nome"}
                    </p>
                    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {contactPhones(selectedContact).map((p) => (
                        <p key={p} className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="truncate">{p}</span>
                        </p>
                      ))}
                      {selectedContact.email ? (
                        <p className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{selectedContact.email}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                </div>
              </div>
            ) : contactId && linkedContactLabel ? (
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-sm font-semibold text-foreground">{linkedContactLabel}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Contato já vinculado a este lote</p>
              </div>
            ) : null}

            {loadingContacts && contactSearch.length >= 2 ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : (
              <div className="max-h-[40vh] space-y-1.5 overflow-y-auto overscroll-contain rounded-xl border border-border p-2 sm:max-h-44">
                {contacts.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                    Digite ao menos 2 caracteres para buscar.
                  </p>
                ) : (
                  contacts.map((c) => {
                    const name = c.name || "Sem nome";
                    const selected = contactId === c.id;
                    const phones = contactPhones(c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={cn(
                          "flex w-full touch-manipulation items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          "min-h-12 hover:bg-muted",
                          selected && "bg-primary/10 ring-1 ring-primary/30",
                        )}
                        onClick={() => setContactId(c.id)}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {(name.slice(0, 2) || "?").toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                          {phones[0] ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{phones[0]}</span>
                          ) : c.email ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.email}</span>
                          ) : null}
                        </span>
                        {selected ? <Check className="mt-1 h-4 w-4 shrink-0 text-primary" /> : null}
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
                  className="h-11 text-base sm:text-sm"
                />
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="lot-notes">Observações</Label>
          <Textarea
            id="lot-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="min-h-[88px] resize-y text-base sm:text-sm"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11 touch-manipulation sm:min-h-9"
            onClick={() => void handleSubmit()}
            disabled={pending || availableActions.length === 0}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
