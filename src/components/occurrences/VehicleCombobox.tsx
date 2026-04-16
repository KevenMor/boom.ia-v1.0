import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types/database";

type Props = {
  items: InventoryItem[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function vehicleLabel(v: InventoryItem): string {
  const parts = [v.brand, v.model, v.version, v.year ? String(v.year) : null, v.external_id].filter(
    Boolean,
  ) as string[];
  return parts.join(" · ");
}

/** Normaliza status do inventário (API em inglês; exibição em PT). */
function inventoryStatusPresentation(status: string | null | undefined): {
  label: string;
  sold: boolean;
} {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "sold" || s === "vendido") return { label: "Vendido", sold: true };
  if (s === "available" || s === "disponivel" || s === "disponível") return { label: "Disponível", sold: false };
  if (!s) return { label: "—", sold: false };
  return { label: (status ?? "").trim(), sold: false };
}

export function VehicleCombobox({
  items,
  value,
  onValueChange,
  disabled,
  placeholder = "Pesquisar por marca, modelo, ano, ref. externa…",
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);
  const selectedStatus = selected ? inventoryStatusPresentation(selected.status) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className="h-11 w-full justify-between font-normal"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="min-w-0 truncate">{selected ? vehicleLabel(selected) : "Selecionar veículo…"}</span>
            {selected && selectedStatus ? (
              <Badge
                variant={selectedStatus.sold ? "destructive" : "outline"}
                className={cn(
                  "shrink-0 px-1.5 py-0 text-[10px] font-normal",
                  !selectedStatus.sold &&
                    selectedStatus.label === "Disponível" &&
                    "border-emerald-600/45 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300",
                )}
              >
                {selectedStatus.label}
              </Badge>
            ) : null}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        className={cn(
          "z-[60] w-[var(--radix-popover-trigger-width)] max-w-[min(calc(100vw-2rem),36rem)] p-0",
        )}
        onWheel={(e) => e.stopPropagation()}
      >
        <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          Selecionar veículo · {items.length} veículo(s)
        </p>
        <Command shouldFilter>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-[min(42vh,20rem)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y p-1">
            <CommandEmpty className="py-8">Nenhum veículo encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((v) => {
                const st = inventoryStatusPresentation(v.status);
                return (
                  <CommandItem
                    key={v.id}
                    value={`${v.brand ?? ""} ${v.model ?? ""} ${v.version ?? ""} ${v.year ?? ""} ${v.external_id ?? ""} ${v.status ?? ""} ${v.id}`}
                    className="cursor-pointer items-start gap-2 py-2.5"
                    onSelect={() => {
                      onValueChange(v.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", value === v.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-1">
                      <span className="text-sm font-medium leading-snug">{vehicleLabel(v)}</span>
                      {v.external_id ? (
                        <span className="truncate text-xs text-muted-foreground">Ref. externa: {v.external_id}</span>
                      ) : null}
                    </div>
                    <Badge
                      variant={st.sold ? "destructive" : "outline"}
                      className={cn(
                        "shrink-0 whitespace-nowrap text-[10px]",
                        !st.sold &&
                          st.label === "Disponível" &&
                          "border-emerald-600/45 bg-emerald-500/10 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300",
                      )}
                    >
                      {st.label}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
