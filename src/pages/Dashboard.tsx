import { Building2, MessageSquare, DollarSign, AlertTriangle, Bot, Zap, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a) => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tenants Ativos"
          value={loadingTenants ? "..." : String(activeTenants)}
          change={`${tenants?.length ?? 0} total`}
          changeType="neutral"
          icon={Building2}
        />
        <StatCard
          title="Agentes Ativos"
          value={loadingAgents ? "..." : String(activeAgents)}
          change={`${totalAgents} total`}
          changeType="neutral"
          icon={Bot}
        />
        <StatCard
          title="Providers"
          value={loadingProviders ? "..." : String(providers?.length ?? 0)}
          change="Configurados"
          changeType="neutral"
          icon={Zap}
        />
        <StatCard
          title="Erros (24h)"
          value="—"
          change="Sem dados ainda"
          changeType="neutral"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent Tenants */}
        <Card className="col-span-2 border-border bg-card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Tenants Recentes</h2>
          </div>
          <div className="divide-y divide-border">
            {loadingTenants && (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            )}
            {!loadingTenants && (tenants?.length ?? 0) === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhum tenant cadastrado
              </div>
            )}
            {(tenants ?? []).slice(0, 5).map((tenant, i) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  </div>
                </div>
                <Badge
                  className={
                    tenant.status === "active"
                      ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                      : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                  }
                >
                  {tenant.status === "active" ? "Ativo" : tenant.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Providers Status */}
        <Card className="border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Providers</h2>
          <div className="mt-4 space-y-3">
            {loadingProviders && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            )}
            {!loadingProviders && (providers?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum provider</p>
            )}
            {(providers ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.name}</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      p.status === "active" ? "bg-success" : p.status === "degraded" ? "bg-warning" : "bg-destructive"
                    }`}
                  />
                  <span className="text-xs capitalize">{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
