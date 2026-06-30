import React from "react";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { useConversationGrowth } from "@/hooks/useConversationGrowth";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { useTokensByAgent } from "@/hooks/useTokensByAgent";
import { useTenantContext } from "@/contexts/TenantContext";

import { UsageStatsRow } from "@/components/dashboard/UsageStatsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";
import { AgentTokenBreakdown } from "@/components/dashboard/AgentTokenBreakdown";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";

import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import type { Agent } from "@/types/database";

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

  return (
    <div ref={ref} className="space-y-6 md:space-y-8">
      <UsageStatsRow events={recentEvents ?? []} dailySummary={dailySummary ?? []} loading={loadingEvents} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="xl:col-span-4">
          <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <AgentTokenBreakdown data={agentTokens ?? []} loading={loadingAgentTokens} />
        </div>
        <div className="xl:col-span-4">
          <CostEstimationCard events={recentEvents ?? []} loading={loadingEvents} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <RevenueChart
            monthlyData={conversationGrowth?.monthly ?? []}
            annualData={conversationGrowth?.annual ?? []}
            loading={loadingConversationGrowth}
          />
        </div>
        <div>
          <SprintProgress
            activeAgents={activeAgents}
            pausedAgents={pausedAgents}
            totalAgents={totalAgents}
            loading={loadingAgents}
          />
        </div>
        <div>
          <FeatureAdoption agents={totalAgents} providers={providers?.length ?? 0} tenants={activeTenants} />
        </div>
        <div>
          <ProviderTokensCard data={providerTokens ?? []} loading={loadingProviderTokens} />
        </div>
      </div>

      {/* Lista de tenants faz sentido só na visão agregada (superadmin sem tenant fixo). */}
      {selectedTenantId === null && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
          </div>
        </div>
      )}
    </div>
  );
});

export default Dashboard;
