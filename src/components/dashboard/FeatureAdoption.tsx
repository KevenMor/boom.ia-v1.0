import { Card } from "@/components/ui/card";

interface FeatureAdoptionProps {
  agents: number;
  providers: number;
  tenants: number;
}

export function FeatureAdoption({ agents, providers, tenants }: FeatureAdoptionProps) {
  const max = Math.max(agents, providers, tenants, 1);

  const features = [
    { label: "Agentes", value: agents, color: "bg-primary" },
    { label: "Providers", value: providers, color: "bg-cyan-500" },
    { label: "Tenants", value: tenants, color: "bg-emerald-500" },
    { label: "Tools", value: 0, color: "bg-violet-500" },
    { label: "Conversas", value: 0, color: "bg-amber-500" },
  ];

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Adoção de recursos</h2>
          <p className="text-xs text-muted-foreground">Utilização por módulo</p>
        </div>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Detalhes ↗
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {features.map((f) => (
          <div key={f.label} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-muted-foreground text-right">{f.label}</span>
            <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${f.color} transition-all duration-700`}
                style={{ width: `${max > 0 ? Math.max((f.value / max) * 100, f.value > 0 ? 8 : 0) : 0}%` }}
              />
            </div>
            <span className="w-6 text-xs font-medium text-right">{f.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
