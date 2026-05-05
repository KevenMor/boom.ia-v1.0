import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/database";

type Props = {
  items: Contact[];
  value: string;
  onValueChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function ContactAvatarThumb({ contact, className }: { contact: Contact; className?: string }) {
  const url = contact.avatar_url?.trim();
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <User className="h-[55%] w-[55%]" aria-hidden />
      )}
    </div>
  );
}

/** Valor estável por item (cmdk usa isto no filtro). */
function contactSearchBlob(c: Contact): string {
  return [c.name, c.phone ?? "", c.email ?? "", c.id].join(" ").toLowerCase();
}

const DIGITS_ONLY = /\D/g;

/**
 * Filtro estrito: o defeito do cmdk é fuzzy (command-score) e junta telefones parecidos.
 * Aqui só aparece quem contém o texto ou, para pesquisa só com dígitos, quem tem essa sequência no telefone/e-mail/nome/id.
 */
function contactCommandFilter(value: string, search: string): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;

  const hay = value.toLowerCase();
  if (hay.includes(q)) return 1;

  const qDigits = q.replace(DIGITS_ONLY, "");
  if (qDigits.length >= 2) {
    const hayDigits = hay.replace(DIGITS_ONLY, "");
    if (hayDigits.includes(qDigits)) return 1;
  }
  return 0;
}

export function ContactCombobox({
  items,
  value,
  onValueChange,
  disabled,
  placeholder = "Pesquisar por nome, telefone, e-mail…",
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);

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
            {selected ? (
              <>
                <ContactAvatarThumb contact={selected} className="h-8 w-8" />
                <span className="truncate">{selected.name}</span>
              </>
            ) : (
              <span className="truncate">Sem cliente associado…</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        className={cn("z-[60] w-[var(--radix-popover-trigger-width)] max-w-[min(calc(100vw-2rem),36rem)] p-0")}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command shouldFilter filter={contactCommandFilter}>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-[min(38vh,18rem)] min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y p-1">
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ sem cliente nenhum limpar associado opcional"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
                className="text-muted-foreground"
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <span>Sem cliente</span>
              </CommandItem>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={contactSearchBlob(c)}
                  className="cursor-pointer items-center gap-2 py-2 pr-2"
                  onSelect={() => {
                    onValueChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("h-4 w-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                  <ContactAvatarThumb contact={c} className="h-10 w-10" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-snug">{c.name}</span>
                    {(c.phone || c.email) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
