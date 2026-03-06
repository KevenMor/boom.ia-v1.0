import { LayoutGrid } from "lucide-react";

interface FeatureAdoptionProps {
  agents: number;
  providers: number;
  tenants: number;
}

const COLORS = [
  "bg-primary",
  "bg-primary-tint1",
  "bg-primary-tint2",
  "bg-primary-tint3",
  "bg-info",
];

export function FeatureAdoption({ agents, providers, tenants }: FeatureAdoptionProps) {
  const features = [
    { label: "Agentes", value: agents },
    { label: "Providers", value: providers },
    { label: "Tenants", value: tenants },
    { label: "Tools", value: 0 },
    { label: "Conversas", value: 0 },
  ];

  const max = Math.max(...features.map((f) => f.value), 1);

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint3/10">
            <LayoutGrid className="h-4 w-4 text-primary-tint3" />
          </span>
          <span className="box-title">Adoção de Recursos</span>
        </div>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Detalhes ↗
        </span>
      </div>
      <div className="box-body">
        <div className="space-y-3">
          {features.map((f, idx) => {
            const pct = max > 0 ? Math.max((f.value / max) * 100, f.value > 0 ? 8 : 0) : 0;
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs">{f.label}</span>
                  <span className="metric-value text-sm font-semibold">{f.value}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${COLORS[idx % COLORS.length]} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
