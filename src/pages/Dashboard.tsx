import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { SprintProgress } from "@/components/dashboard/SprintProgress";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";
import { FeatureAdoption } from "@/components/dashboard/FeatureAdoption";

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();

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

      {/* Row 1: Chart + Sprint + Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <RevenueChart />
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

      {/* Row 2: Deployments + Feature Adoption */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
        <FeatureAdoption
          agents={totalAgents}
          providers={providers?.length ?? 0}
          tenants={activeTenants}
        />
      </div>
    </div>
  );
}
