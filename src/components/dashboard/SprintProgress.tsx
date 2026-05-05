import { Users } from "lucide-react";
import { type DashboardVisual, inlineLinkClass, subtitleClass } from "@/lib/dashboard-visual";

interface SprintProgressProps {
  activeAgents: number;
  pausedAgents: number;
  totalAgents: number;
  loading?: boolean;
  visual?: DashboardVisual;
}

export function SprintProgress({
  activeAgents,
  pausedAgents,
  totalAgents,
  loading,
  visual = "default",
}: SprintProgressProps) {
  const inactive = Math.max(0, totalAgents - activeAgents - pausedAgents);
  const total = totalAgents || 1;

  const segments = [
    { label: "Ativos", count: activeAgents, twClass: "bg-primary", cwColor: "var(--cw-series-1)" },
    { label: "Pausados", count: pausedAgents, twClass: "bg-primary-tint1", cwColor: "var(--cw-series-3)" },
    { label: "Inativos", count: inactive, twClass: "bg-primary-tint3", cwColor: "var(--cw-series-2)" },
  ];

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-solid-2"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10"
            }
          >
            <Users className={visual === "cw" ? "h-4 w-4 text-cw-slate-11" : "h-4 w-4 text-secondary"} />
          </span>
          <div>
            <span className="box-title">Agentes</span>
            <p className={subtitleClass(visual)}>{loading ? "Carregando..." : `${totalAgents} configurados`}</p>
          </div>
        </div>
        <a href="/agents" className={inlineLinkClass(visual)}>
          Ver todos ↗
        </a>
      </div>
      <div className="box-body">
        {/* Progress bar */}
        <div
          className={
            visual === "cw" ? "flex h-2.5 w-full overflow-hidden rounded-full bg-cw-solid-2" : "flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          }
        >
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={
                visual === "cw" ? "transition-all duration-500" : `${seg.twClass} transition-all duration-500`
              }
              style={{
                width: `${(seg.count / total) * 100}%`,
                ...(visual === "cw" ? { backgroundColor: seg.cwColor } : {}),
              }}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((seg) => (
            <span
              key={seg.label}
              className={
                visual === "cw" ? "flex items-center gap-1.5 text-xs text-cw-slate-10" : "flex items-center gap-1.5 text-xs text-muted-foreground"
              }
            >
              <span
                className={visual === "cw" ? "h-2 w-2 shrink-0 rounded-full" : `h-2 w-2 rounded-full ${seg.twClass}`}
                style={visual === "cw" ? { backgroundColor: seg.cwColor } : undefined}
              />
              {seg.label} ({seg.count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
