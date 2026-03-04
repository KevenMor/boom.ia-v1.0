import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { UsageStatsRow } from "@/components/dashboard/UsageStatsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: dailySummary, isLoading: loadingDaily } = useUsageDailySummary();
  const { data: recentEvents, isLoading: loadingEvents } = useRecentUsageEvents(200);
  const { data: providerTokens, isLoading: loadingProviderTokens } = useTokensByProvider();

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a: any) => a.status === "active").length ?? 0;
  const pausedAgents = agents?.filter((a: any) => a.status !== "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground">Dashboards → Boom IA</p>
        <h1 className="text-xl font-bold">Painel</h1>
      </div>

      {/* Row 0: Usage Stats */}
      <UsageStatsRow events={recentEvents ?? []} loading={loadingEvents} />

      {/* Row 1: Token Chart (wider) + Model Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="lg:col-span-4">
          <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
        </div>
      </div>

      {/* Row 2: Latency (wider) + Provider Tokens */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <LatencyChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="lg:col-span-4">
          <ProviderTokensCard data={providerTokens ?? []} loading={loadingProviderTokens} />
        </div>
      </div>

      {/* Row 3: Conversation Growth + Agents + Feature Adoption */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RevenueChart />
        <SprintProgress
          activeAgents={activeAgents}
          pausedAgents={pausedAgents}
          totalAgents={totalAgents}
          loading={loadingAgents}
        />
        <FeatureAdoption
          agents={totalAgents}
          providers={providers?.length ?? 0}
          tenants={activeTenants}
        />
      </div>

      {/* Row 4: Activity + Recent Tenants */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityFeed />
        <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
      </div>
    </div>
  );
}
