import * as React from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Converte YYYY-MM-DD para Date */
function parseYMD(ymd: string): Date | undefined {
  if (!ymd || ymd.length < 10) return undefined;
  const d = parse(ymd, "yyyy-MM-dd", new Date());
  return isNaN(d.getTime()) ? undefined : d;
}

/** Converte Date para YYYY-MM-DD */
function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Formata para exibição DD/MM/AAAA */
function formatBR(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return "";
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

interface DateInputBRProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateInputBR({ value, onChange, placeholder = "DD/MM/AAAA", className, disabled }: DateInputBRProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseYMD(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? formatBR(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(toYMD(d));
              setOpen(false);
            }
          }}
          locale={ptBR}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
