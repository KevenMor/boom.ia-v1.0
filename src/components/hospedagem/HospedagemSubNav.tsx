import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, BedDouble, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmbedHospedagemOptional } from "@/contexts/EmbedHospedagemContext";

const TAB_DEFS = [
  { segment: "calendario-parque", label: "Calendário do parque", icon: CalendarDays },
  { segment: "cadastro", label: "Estoque de quartos", icon: BedDouble },
  { segment: "valores", label: "Valores", icon: Receipt },
] as const;

export function HospedagemSubNav({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const embed = useEmbedHospedagemOptional();
  const isEmbedChrome = Boolean(embed?.ready);
  const base = embed?.basePath ?? "/hospedagem";
  const tabs = TAB_DEFS.map((t) => ({ ...t, to: `${base}/${t.segment}` }));

  if (isEmbedChrome) {
    return (
      <nav
        className={cn(
          "flex gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        aria-label="Seções de reservas"
      >
        {tabs.map((t) => {
          const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              role="tab"
              aria-selected={active}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-[#1f93ff]/30",
                active
                  ? "bg-[#1f93ff]/10 text-[#1f93ff]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#1f93ff]" : "opacity-70")} aria-hidden />
              {t.label}
            </NavLink>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        "-mx-px mt-6 flex gap-6 overflow-x-auto border-b border-slate-200 dark:border-border [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-8 md:gap-10 [&::-webkit-scrollbar]:hidden",
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
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground",
            )}
          >
            {t.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
