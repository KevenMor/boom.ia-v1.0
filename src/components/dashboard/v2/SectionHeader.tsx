import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}

export function SectionHeader({ eyebrow, title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="tu-label mb-0.5">{eyebrow}</p> : null}
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-foreground sm:text-base">{title}</h2>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <Link
          to={action.to}
          className="text-[12.5px] font-medium text-primary/90 transition-colors hover:text-primary"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
