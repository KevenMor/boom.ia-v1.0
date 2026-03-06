import { Users } from "lucide-react";

interface SprintProgressProps {
  activeAgents: number;
  pausedAgents: number;
  totalAgents: number;
  loading?: boolean;
}

export function SprintProgress({ activeAgents, pausedAgents, totalAgents, loading }: SprintProgressProps) {
  const inactive = Math.max(0, totalAgents - activeAgents - pausedAgents);
  const total = totalAgents || 1;

  const segments = [
    { label: "Ativos", count: activeAgents, color: "bg-primary" },
    { label: "Pausados", count: pausedAgents, color: "bg-primary-tint1" },
    { label: "Inativos", count: inactive, color: "bg-primary-tint3" },
  ];

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10">
            <Users className="h-4 w-4 text-secondary" />
          </span>
          <div>
            <span className="box-title">Agentes</span>
            <p className="text-[11px] text-muted-foreground">
              {loading ? "Carregando..." : `${totalAgents} configurados`}
            </p>
          </div>
        </div>
        <a href="/agents" className="text-xs text-primary font-medium hover:underline">
          Ver todos ↗
        </a>
      </div>
      <div className="box-body">
        {/* Progress bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((seg) => (
            <div
              key={seg.label}
              className={`${seg.color} transition-all duration-500`}
              style={{ width: `${(seg.count / total) * 100}%` }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((seg) => (
            <span key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${seg.color}`} />
              {seg.label} ({seg.count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
