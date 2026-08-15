import { Building2, Bot, Layers, Cpu } from "lucide-react";

interface Props {
  activeAgents: number;
  totalAgents: number;
  activeTenants: number;
  providers: number;
  loading?: boolean;
}

export function OpsKpiStrip({
  activeAgents,
  totalAgents,
  activeTenants,
  providers,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="tu-kpi h-[112px] animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  const utilPct = totalAgents > 0 ? Math.min(100, Math.round((activeAgents / totalAgents) * 100)) : 0;

  const items = [
    {
      key: "tenants",
      label: "Empresas ativas",
      value: String(activeTenants),
      hint: "Contas no workspace",
      icon: Building2,
    },
    {
      key: "agents",
      label: "Agentes ativos",
      value: String(activeAgents),
      hint: totalAgents > 0 ? `${utilPct}% da capacidade · ${totalAgents} no total` : "Nenhum agente",
      icon: Bot,
    },
    {
      key: "fleet",
      label: "Frota configurada",
      value: String(totalAgents),
      hint: "Agentes no escopo atual",
      icon: Layers,
    },
    {
      key: "providers",
      label: "Providers",
      value: String(providers),
      hint: "Modelos LLM disponíveis",
      icon: Cpu,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="tu-kpi flex min-h-[108px] flex-col px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="tu-label">{item.label}</span>
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="tu-value text-[1.375rem] sm:text-[1.5rem]">{item.value}</p>
            <p className="tu-hint mt-auto pt-2">{item.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
