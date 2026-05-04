import { cn } from "@/lib/utils";

interface MsProps {
  name: string;
  className?: string;
}

/** Ícone Material Symbols (font em index.html — painel Stitch). */
export function Ms({ name, className }: MsProps) {
  return (
    <span className={cn("material-symbols-outlined select-none [&]:leading-none", className)} aria-hidden>
      {name}
    </span>
  );
}
