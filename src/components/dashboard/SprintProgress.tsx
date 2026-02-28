import { Card } from "@/components/ui/card";

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
    { label: "Pausados", count: pausedAgents, color: "bg-cyan-500" },
    { label: "Inativos", count: inactive, color: "bg-amber-500" },
  ];

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Agentes</h2>
          <p className="text-xs text-muted-foreground">
            {loading ? "Carregando..." : `${totalAgents} agentes configurados`}
          </p>
        </div>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Ver todos ↗
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all duration-500`}
            style={{ width: `${(seg.count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${seg.color}`} />
            {seg.label} ({seg.count})
          </span>
        ))}
      </div>
    </Card>
  );
}
