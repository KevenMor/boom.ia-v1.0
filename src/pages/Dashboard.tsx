import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useUsageDailySummary, useRecentUsageEvents } from "@/hooks/useUsageMetrics";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";
import { UsageStatsRow } from "@/components/dashboard/UsageStatsRow";
import { TokenUsageChart } from "@/components/dashboard/TokenUsageChart";
import { LatencyChart } from "@/components/dashboard/LatencyChart";
import { ModelBreakdown } from "@/components/dashboard/ModelBreakdown";

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: dailySummary, isLoading: loadingDaily } = useUsageDailySummary();
  const { data: recentEvents, isLoading: loadingEvents } = useRecentUsageEvents(200);

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a: any) => a.status === "active").length ?? 0;
  const pausedAgents = agents?.filter((a: any) => a.status !== "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground">Dashboards → Nexus AI</p>
        <h1 className="text-xl font-bold">Painel</h1>
      </div>

      {/* Row 0: Usage Stats (tokens, latency, tool calls, requests) */}
      <UsageStatsRow events={recentEvents ?? []} loading={loadingEvents} />

      {/* Row 1: Token Usage Chart + Model Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <TokenUsageChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="lg:col-span-4">
          <ModelBreakdown data={dailySummary ?? []} loading={loadingDaily} />
        </div>
      </div>

      {/* Row 2: Latency Chart + Sprint Progress + Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <LatencyChart data={dailySummary ?? []} loading={loadingDaily} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <SprintProgress
            activeAgents={activeAgents}
            pausedAgents={pausedAgents}
            totalAgents={totalAgents}
            loading={loadingAgents}
          />
          <ActivityFeed />
        </div>
      </div>

      {/* Row 3: Conversation Growth + Deployments + Feature Adoption */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <RevenueChart />
        </div>
        <div className="lg:col-span-3">
          <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
        </div>
        <div className="lg:col-span-4">
          <FeatureAdoption
            agents={totalAgents}
            providers={providers?.length ?? 0}
            tenants={activeTenants}
          />
        </div>
      </div>
    </div>
  );
}
