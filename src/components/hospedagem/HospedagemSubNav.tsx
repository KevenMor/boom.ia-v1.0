import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/hospedagem/calendario-parque", label: "Calendário do parque" },
  { to: "/hospedagem/cadastro", label: "Estoque de quartos" },
  { to: "/hospedagem/valores", label: "Valores" },
] as const;

export function HospedagemSubNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="-mx-px mt-6 flex gap-6 overflow-x-auto border-b border-[#ccc3d8] dark:border-border [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-8 md:gap-10 [&::-webkit-scrollbar]:hidden"
      aria-label="Seções de gestão de reservas"
    >
      {TABS.map((t) => {
        const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
        return (
          <NavLink
            key={t.to}
            to={t.to}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative -mb-px shrink-0 whitespace-nowrap border-b-2 pb-3 pt-0.5 text-sm font-semibold tracking-wide outline-none ring-offset-background transition-colors focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 dark:ring-offset-card",
              active
                ? "border-[#630ed4] text-[#630ed4]"
                : "border-transparent text-[#4a4455] hover:border-[#ccc3d8]/80 hover:text-[#630ed4] dark:text-muted-foreground dark:hover:border-border dark:hover:text-foreground"
            )}
          >
            {t.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
