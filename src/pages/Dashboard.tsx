import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { useConversationGrowth } from "@/hooks/useConversationGrowth";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { useTokensByAgent } from "@/hooks/useTokensByAgent";
import { useTenantContext } from "@/contexts/TenantContext";
import { OpsKpiStrip } from "@/components/dashboard/v2/OpsKpiStrip";
import { SectionHeader } from "@/components/dashboard/v2/SectionHeader";
import { QuickActionsRow } from "@/components/dashboard/v2/QuickActionsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";
import { AgentTokenBreakdown } from "@/components/dashboard/AgentTokenBreakdown";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/database";

function todayLabelBrasilia(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

const Dashboard = React.forwardRef<HTMLDivElement>(function Dashboard(_props, ref) {
  const { selectedTenantId } = useTenantContext();
  const { data: tenants, isLoading: loadingTenantsRaw } = useTenants();
  const { data: agents, isLoading: loadingAgentsRaw } = useAgents(selectedTenantId ?? undefined);
  const { data: providers } = useProviders();
  const { data: dailySummary, isLoading: loadingDailyRaw } = useUsageDailySummary(selectedTenantId);
  const { data: recentEvents, isLoading: loadingEventsRaw } = useRecentUsageEvents(8000, selectedTenantId);
  const { data: providerTokens, isLoading: loadingProviderTokensRaw } = useTokensByProvider(selectedTenantId);
  const { data: agentTokens, isLoading: loadingAgentTokensRaw } = useTokensByAgent(7, selectedTenantId);
  const { data: conversationGrowth, isLoading: loadingConversationGrowthRaw } =
    useConversationGrowth(selectedTenantId);

  const [infraOpen, setInfraOpen] = useState(false);

  const loadingTenants = loadingTenantsRaw && !tenants;
  const loadingAgents = loadingAgentsRaw && !agents;
  const loadingDaily = loadingDailyRaw && !dailySummary;
  const loadingEvents = loadingEventsRaw && !recentEvents;
  const loadingProviderTokens = loadingProviderTokensRaw && !providerTokens;
  const loadingAgentTokens = loadingAgentTokensRaw && !agentTokens;
  const loadingConversationGrowth = loadingConversationGrowthRaw && !conversationGrowth;

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a: Agent) => a.status === "active").length ?? 0;
  const pausedAgents = agents?.filter((a: Agent) => a.status !== "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  const conversationDelta = useMemo(() => {
    const monthly = conversationGrowth?.monthly ?? [];
    if (monthly.length < 2) return null;
    const last = monthly[monthly.length - 1]?.conversas ?? 0;
    const prev = monthly[monthly.length - 2]?.conversas ?? 0;
    if (prev <= 0) return last > 0 ? 100 : null;
    return Math.round(((last - prev) / prev) * 100);
  }, [conversationGrowth]);

  const dateLabel = todayLabelBrasilia();

  return (
    <div
      ref={ref}
      className="ds-typeui font-plex -m-6 min-h-[calc(100dvh-4rem)] space-y-7 p-6 md:-m-8 md:space-y-8 md:p-8"
    >
      <header className="border-b border-border/70 pb-5">
        <p className="tu-label mb-1">{dateLabel}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem]">
          Centro de operação
        </h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
          Decida rápido: fila, capacidade e custo. Infra de modelos fica em segundo plano.
        </p>
      </header>

      <section>
        <SectionHeader
          eyebrow="Atalhos"
          title="Ir para a operação"
          description="Os caminhos do dia a dia — fila, chat e agentes."
        />
        <QuickActionsRow />
      </section>

      <section>
        <SectionHeader
          eyebrow="Operação"
          title="Resumo do dia"
          description="Atividade, capacidade e custo — o essencial para decidir rápido."
        />
        <OpsKpiStrip
          events={recentEvents ?? []}
          activeAgents={activeAgents}
          totalAgents={totalAgents}
          conversationDelta={conversationDelta}
          loading={loadingEvents || loadingAgents}
        />
      </section>

      <section>
        <SectionHeader
          eyebrow="Resultado"
          title="Crescimento e capacidade"
          description="Conversas novas e status da frota de agentes."
          action={{ label: "Ver chat ao vivo →", to: "/conversations" }}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="tu-panel overflow-hidden xl:col-span-8 [&_.box]:border-0 [&_.box]:bg-transparent [&_.box]:shadow-none">
            <RevenueChart
              monthlyData={conversationGrowth?.monthly ?? []}
              annualData={conversationGrowth?.annual ?? []}
              loading={loadingConversationGrowth}
            />
          </div>
          <div className="flex flex-col gap-4 xl:col-span-4">
            <div className="tu-panel overflow-hidden [&_.box]:border-0 [&_.box]:bg-transparent [&_.box]:shadow-none">
              <SprintProgress
                activeAgents={activeAgents}
                pausedAgents={pausedAgents}
                totalAgents={totalAgents}
                loading={loadingAgents}
              />
            </div>
            <div className="tu-panel overflow-hidden [&_.box]:border-0 [&_.box]:bg-transparent [&_.box]:shadow-none">
              <FeatureAdoption
                agents={totalAgents}
                providers={providers?.length ?? 0}
                tenants={activeTenants}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Financeiro"
          title="Custo e consumo"
          description="Estimativa do período e distribuição por agente."
          action={{ label: "Analytics →", to: "/analytics/tokens" }}
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <div className="tu-panel overflow-hidden [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
              <AgentTokenBreakdown data={agentTokens ?? []} loading={loadingAgentTokens} />
            </div>
          </div>
          <div className="xl:col-span-4">
            <div className="tu-panel overflow-hidden [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
              <CostEstimationCard events={recentEvents ?? []} loading={loadingEvents} />
            </div>
          </div>
        </div>
      </section>

      <Collapsible open={infraOpen} onOpenChange={setInfraOpen}>
        <div className="tu-panel overflow-hidden">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30">
            <div>
              <p className="tu-label mb-1">Infraestrutura</p>
              <p className="text-sm font-semibold text-foreground">Consumo técnico de modelos</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tokens, provedores e breakdown por modelo — útil para tuning, não para o dia a dia.
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                infraOpen && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 border-t border-border px-4 pb-4 pt-4 sm:px-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-8 [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
                  <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
                </div>
                <div className="xl:col-span-4 [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
                  <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
                </div>
              </div>
              <div className="max-w-sm [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none [&_.box]:border-0 [&_.box]:bg-transparent [&_.box]:shadow-none">
                <ProviderTokensCard data={providerTokens ?? []} loading={loadingProviderTokens} />
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {selectedTenantId === null && (
        <section>
          <SectionHeader eyebrow="Workspace" title="Tenants recentes" />
          <div className="tu-panel max-w-2xl overflow-hidden [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
            <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
          </div>
        </section>
      )}
    </div>
  );
});

export default Dashboard;
