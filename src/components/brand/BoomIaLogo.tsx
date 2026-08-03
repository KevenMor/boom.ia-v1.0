import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import boomLogoDark from "@/assets/boom-ia-logo-dark.png";
import boomLogo from "@/assets/boom-ia-logo.png";

type Props = {
  collapsed?: boolean;
  className?: string;
  onNavigate?: () => void;
};

export function BoomIaLogo({ collapsed, className, onNavigate }: Props) {
  return (
    <NavLink
      to="/dashboard"
      onClick={onNavigate}
      className={cn(
        "flex items-center outline-none",
        collapsed ? "justify-center" : "px-1",
        className,
      )}
    >
      <img
        src={boomLogo}
        alt="Boom IA"
        className={cn(
          "hidden dark:block object-contain",
          collapsed ? "h-7 w-7" : "h-8 w-auto max-w-[140px]",
        )}
      />
      <img
        src={boomLogoDark}
        alt="Boom IA"
        className={cn(
          "block dark:hidden object-contain",
          collapsed ? "h-7 w-7" : "h-8 w-auto max-w-[140px]",
        )}
      />
    </NavLink>
  );
}
