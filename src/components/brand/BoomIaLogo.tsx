import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
/** Variante clara (ex.: texto branco) — boa em fundo escuro / sidebar dark */
import logoOnDarkBg from "@/assets/boom-ia-logo.png";
/** Variante “dark” no nome do ficheiro = mesmo asset do Login — texto roxo para fundos claros */
import logoOnLightBg from "@/assets/boom-ia-logo-dark.png";

type Props = {
  collapsed?: boolean;
  className?: string;
  onNavigate?: () => void;
};

/**
 * Logo bOOm.iA — `src/assets/boom-ia-logo*.png` (iguais ao Login).
 * Tema claro: marca roxa + contentor discreto (sem bg preto).
 * Tema escuro: marca clara + contentor preto.
 */
export function BoomIaLogo({ collapsed, className, onNavigate }: Props) {
  const shell = cn(
    "rounded-xl",
    "bg-transparent shadow-none ring-1 ring-slate-200/70 dark:bg-black dark:shadow-sm dark:ring-white/10",
  );

  const imgForLightSidebar = cn("max-h-full max-w-full object-contain dark:hidden");
  const imgForDarkSidebar = cn("max-h-full max-w-full object-contain hidden dark:block");

  if (collapsed) {
    return (
      <NavLink
        to="/dashboard"
        title="bOOm.iA"
        onClick={onNavigate}
        className={cn(
          "flex justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
          className,
        )}
      >
        <div
          className={cn(
            shell,
            "flex items-center justify-center",
            "h-11 w-11 p-1.5 dark:h-10 dark:w-10 dark:p-1",
          )}
        >
          <img src={logoOnLightBg} alt="bOOm.iA" className={imgForLightSidebar} width={160} height={48} decoding="async" />
          <img src={logoOnDarkBg} alt="bOOm.iA" className={imgForDarkSidebar} width={160} height={48} decoding="async" />
        </div>
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/dashboard"
      title="bOOm.iA — Início"
      onClick={onNavigate}
      className={cn(
        "block min-w-0 rounded-xl outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#7c3aed]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
        className,
      )}
    >
      <div className={cn(shell, "px-3 py-2 dark:px-3 dark:py-2")}>
        <img
          src={logoOnLightBg}
          alt="bOOm.iA"
          className={cn("mx-auto w-auto max-w-full object-contain dark:hidden", "h-10 sm:h-12")}
          width={200}
          height={56}
          decoding="async"
        />
        <img
          src={logoOnDarkBg}
          alt="bOOm.iA"
          className={cn("mx-auto hidden w-auto max-w-full object-contain dark:block", "h-8 sm:h-9")}
          width={200}
          height={56}
          decoding="async"
        />
      </div>
    </NavLink>
  );
}
