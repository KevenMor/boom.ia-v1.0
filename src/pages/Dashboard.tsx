import React from "react";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { useTokensByAgent } from "@/hooks/useTokensByAgent";
import { useTenantContext } from "@/contexts/TenantContext";
import { BannerCard } from "@/components/dashboard/BannerCard";
import { UsageStatsRow } from "@/components/dashboard/UsageStatsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";
import { AgentTokenBreakdown } from "@/components/dashboard/AgentTokenBreakdown";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";

const Dashboard = React.forwardRef<HTMLDivElement>(function Dashboard(_props, ref) {
  const { selectedTenantId } = useTenantContext();
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents(selectedTenantId ?? undefined);
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: dailySummary, isLoading: loadingDaily } = useUsageDailySummary();
  const { data: recentEvents, isLoading: loadingEvents } = useRecentUsageEvents(200);
  const { data: providerTokens, isLoading: loadingProviderTokens } = useTokensByProvider(selectedTenantId);
  const { data: agentTokens, isLoading: loadingAgentTokens } = useTokensByAgent(7);

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a: any) => a.status === "active").length ?? 0;
  const pausedAgents = agents?.filter((a: any) => a.status !== "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Dashboards → Boom IA</p>
          <h1 className="text-lg font-semibold">Analytics</h1>
        </div>
      </div>

      {/* ROW 1: Banner + 4 KPI Stats */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-4">
          <BannerCard />
        </div>
        <div className="col-span-12 xl:col-span-8">
          <UsageStatsRow events={recentEvents ?? []} dailySummary={dailySummary ?? []} loading={loadingEvents} />
        </div>
      </div>

      {/* ROW 2: Activity + Token Chart + Model Breakdown */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-3">
          <ActivityFeed />
        </div>
        <div className="col-span-12 xl:col-span-6">
          <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="col-span-12 xl:col-span-3">
          <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
        </div>
      </div>

      {/* ROW 3: Agent Tokens + Landing Pages (Latency) + Cost */}
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

      {/* ROW 4: Conversations + Agents + Adoption + Provider Tokens */}
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
          <FeatureAdoption
            agents={totalAgents}
            providers={providers?.length ?? 0}
            tenants={activeTenants}
          />
        </div>
        <div className="col-span-12 md:col-span-6 lg:col-span-3">
          <ProviderTokensCard data={providerTokens ?? []} loading={loadingProviderTokens} />
        </div>
      </div>

      {/* ROW 5: Activity Feed + Recent Tenants */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
        </div>
      </div>
    </div>
  );
});

export default Dashboard;
