import React from "react";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { useTokensByAgent } from "@/hooks/useTokensByAgent";
import { useTenantContext } from "@/contexts/TenantContext";

import { UsageStatsRow } from "@/components/dashboard/UsageStatsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";
import { AgentTokenBreakdown } from "@/components/dashboard/AgentTokenBreakdown";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";

import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import type { Agent } from "@/types/database";

const Dashboard = React.forwardRef<HTMLDivElement>(function Dashboard(_props, ref) {
  const { selectedTenantId } = useTenantContext();
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents(selectedTenantId ?? undefined);
  const { data: providers } = useProviders();
  const { data: dailySummary, isLoading: loadingDaily } = useUsageDailySummary(selectedTenantId);
  const { data: recentEvents, isLoading: loadingEvents } = useRecentUsageEvents(8000, selectedTenantId);
  const { data: providerTokens, isLoading: loadingProviderTokens } = useTokensByProvider(selectedTenantId);
  const { data: agentTokens, isLoading: loadingAgentTokens } = useTokensByAgent(7, selectedTenantId);

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a: Agent) => a.status === "active").length ?? 0;
  const pausedAgents = agents?.filter((a: Agent) => a.status !== "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div ref={ref} className="space-y-6">
      <UsageStatsRow events={recentEvents ?? []} dailySummary={dailySummary ?? []} loading={loadingEvents} />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-5">
          <AgentTokenBreakdown data={agentTokens ?? []} loading={loadingAgentTokens} />
        </div>
        <div className="col-span-12 xl:col-span-4">
          <LatencyChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="col-span-12 xl:col-span-3">
          <CostEstimationCard events={recentEvents ?? []} loading={loadingEvents} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6 lg:col-span-3">
          <RevenueChart />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-3">
          <SprintProgress
            activeAgents={activeAgents}
            pausedAgents={pausedAgents}
            totalAgents={totalAgents}
            loading={loadingAgents}
          />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-3">
          <FeatureAdoption agents={totalAgents} providers={providers?.length ?? 0} tenants={activeTenants} />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-3">
          <ProviderTokensCard data={providerTokens ?? []} loading={loadingProviderTokens} />
        </div>
      </div>

      {/* Lista de tenants faz sentido só na visão agregada (superadmin sem tenant fixo). */}
      {selectedTenantId === null && (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-6">
            <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
          </div>
        </div>
      )}
    </div>
  );
});

export default Dashboard;
