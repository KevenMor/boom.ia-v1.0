import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEmbedHospedagemOptional } from "@/contexts/EmbedHospedagemContext";

const TAB_DEFS = [
  { segment: "calendario-parque", label: "Calendário do parque" },
  { segment: "cadastro", label: "Estoque de quartos" },
  { segment: "valores", label: "Valores" },
] as const;

export function HospedagemSubNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const embed = useEmbedHospedagemOptional();
  const base = embed?.basePath ?? "/hospedagem";
  const tabs = TAB_DEFS.map((t) => ({ ...t, to: `${base}/${t.segment}` }));

  return (
    <nav
      className={cn(
        "-mx-px flex gap-6 overflow-x-auto border-b border-slate-200 dark:border-border [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-8 md:gap-10 [&::-webkit-scrollbar]:hidden",
        embed?.ready ? "mt-3" : "mt-6",
        className,
      )}
      aria-label="Seções de gestão de reservas"
    >
      {tabs.map((t) => {
        const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
        return (
          <NavLink
            key={t.to}
            to={t.to}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative -mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 pt-0.5 text-sm font-semibold tracking-wide outline-none ring-offset-background transition-colors focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:ring-offset-card",
              active
                ? "border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground"
            )}
          >
            {t.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
