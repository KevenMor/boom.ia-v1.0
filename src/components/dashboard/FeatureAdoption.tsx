import { LayoutGrid } from "lucide-react";
import { type DashboardVisual, cwSeriesColor, inlineLinkClass } from "@/lib/dashboard-visual";

interface FeatureAdoptionProps {
  agents: number;
  providers: number;
  /** Em escopo global: nº de tenants ativos. Em `tenant`: use 1 se há tenant selecionado, 0 caso contrário. */
  tenants: number;
  visual?: DashboardVisual;
  /** `tenant`: o terceiro item vira "Empresa" (foco no tenant atual), não a contagem global de tenants. */
  scope?: "global" | "tenant";
}

const COLORS = [
  "bg-primary",
  "bg-primary-tint1",
  "bg-primary-tint2",
  "bg-primary-tint3",
  "bg-info",
];

export function FeatureAdoption({
  agents,
  providers,
  tenants,
  visual = "default",
  scope = "global",
}: FeatureAdoptionProps) {
  const tenantRowLabel = scope === "tenant" ? "Empresa" : "Tenants";
  const features = [
    { label: "Agentes", value: agents },
    { label: "Providers", value: providers },
    { label: tenantRowLabel, value: tenants },
    { label: "Tools", value: 0 },
    { label: "Conversas", value: 0 },
  ];

  const max = Math.max(...features.map((f) => f.value), 1);

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint3/10"
            }
          >
            <LayoutGrid className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary-tint3"} />
          </span>
          <span className="box-title">Adoção de Recursos</span>
        </div>
        <span className={`${inlineLinkClass(visual)} cursor-pointer`}>Detalhes ↗</span>
      </div>
      <div className="box-body">
        <div className="space-y-3">
          {features.map((f, idx) => {
            const pct = max > 0 ? Math.max((f.value / max) * 100, f.value > 0 ? 8 : 0) : 0;
            return (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={visual === "cw" ? "text-xs text-cw-slate-12" : "text-xs"}>{f.label}</span>
                  <span
                    className={
                      visual === "cw" ? "metric-value text-sm font-semibold text-cw-slate-12" : "metric-value text-sm font-semibold"
                    }
                  >
                    {f.value}
                  </span>
                </div>
                <div
                  className={
                    visual === "cw" ? "h-2 w-full overflow-hidden rounded-full bg-cw-solid-2" : "h-2 w-full rounded-full bg-muted overflow-hidden"
                  }
                >
                  <div
                    className={
                      visual === "cw" ? "h-full rounded-full transition-all duration-700" : `h-full rounded-full ${COLORS[idx % COLORS.length]} transition-all duration-700`
                    }
                    style={{
                      width: `${pct}%`,
                      ...(visual === "cw" ? { backgroundColor: cwSeriesColor(idx) } : {}),
                    }}
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
