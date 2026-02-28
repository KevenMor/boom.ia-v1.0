import {
  Building2,
  Bot,
  Zap,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Activity,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { useConversations } from "@/hooks/useConversations";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Mock chart data — replace with real data when available
const areaData = [
  { month: "Jan", conversas: 120, agentes: 2 },
  { month: "Fev", conversas: 180, agentes: 2 },
  { month: "Mar", conversas: 240, agentes: 3 },
  { month: "Abr", conversas: 310, agentes: 3 },
  { month: "Mai", conversas: 280, agentes: 4 },
  { month: "Jun", conversas: 390, agentes: 4 },
  { month: "Jul", conversas: 450, agentes: 5 },
];

const COLORS = [
  "hsl(217, 72%, 58%)",
  "hsl(158, 60%, 44%)",
  "hsl(38, 80%, 55%)",
  "hsl(0, 68%, 55%)",
  "hsl(270, 60%, 55%)",
];

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a) => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  // Provider distribution for pie chart
  const providerCounts = (providers ?? []).map((p) => ({
    name: p.name,
    value: (agents ?? []).filter((a: any) => a.provider_id === p.id).length || 1,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da plataforma Nexus AI
        </p>
      </div>

      {/* Stats Grid — 5 columns like Xintra */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Tenants Ativos"
          value={loadingTenants ? "..." : String(activeTenants)}
          change={`${tenants?.length ?? 0} total`}
          changeType="neutral"
          icon={Building2}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-500"
        />
        <StatCard
          title="Agentes Ativos"
          value={loadingAgents ? "..." : String(activeAgents)}
          change={`${totalAgents} total`}
          changeType="neutral"
          icon={Bot}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-500"
        />
        <StatCard
          title="Providers"
          value={loadingProviders ? "..." : String(providers?.length ?? 0)}
          change="Configurados"
          changeType="neutral"
          icon={Zap}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-500"
        />
        <StatCard
          title="Conversas"
          value="—"
          change="Sem dados ainda"
          changeType="neutral"
          icon={MessageSquare}
          iconBg="bg-violet-500/10"
          iconColor="text-violet-500"
        />
        <StatCard
          title="Erros (24h)"
          value="—"
          change="Sem dados ainda"
          changeType="neutral"
          icon={AlertTriangle}
          iconBg="bg-rose-500/10"
          iconColor="text-rose-500"
        />
      </div>

      {/* Row 2: Revenue-style highlight + Area Chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Highlight Cards */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card className="flex-1 rounded-xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground border-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary-foreground/70">Total de Agentes</p>
                <p className="mt-1 text-3xl font-bold">{loadingAgents ? "..." : totalAgents}</p>
                <span className="mt-2 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                  {activeAgents} ativos
                </span>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                <Bot className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="flex-1 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-500 p-5 text-white border-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white/70">Tenants</p>
                <p className="mt-1 text-3xl font-bold">{loadingTenants ? "..." : tenants?.length ?? 0}</p>
                <span className="mt-2 inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
                  {activeTenants} ativos
                </span>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        {/* Area Chart */}
        <Card className="lg:col-span-6 rounded-xl border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold">Visão Geral de Conversas</h2>
              <p className="text-xs text-muted-foreground">Últimos 7 meses</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Conversas
              </span>
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="colorConversas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 72%, 58%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217, 72%, 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 12%, 18%)" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 48%)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(220, 10%, 48%)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(225, 16%, 12%)",
                    border: "1px solid hsl(225, 12%, 18%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(220, 20%, 93%)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="conversas"
                  stroke="hsl(217, 72%, 58%)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorConversas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Providers Distribution */}
        <Card className="lg:col-span-3 rounded-xl border-border bg-card p-5">
          <h2 className="text-sm font-bold">Distribuição por Provider</h2>
          <p className="text-xs text-muted-foreground">Agentes por provedor</p>
          {loadingProviders ? (
            <Skeleton className="mt-4 h-[180px] w-full" />
          ) : providerCounts.length > 0 ? (
            <>
              <div className="mx-auto h-[150px] w-[150px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerCounts}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {providerCounts.map((_entry, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(225, 16%, 12%)",
                        border: "1px solid hsl(225, 12%, 18%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(220, 20%, 93%)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {providerCounts.map((p, idx) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{p.name}</span>
                    </span>
                    <span className="font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Nenhum provider</p>
          )}
        </Card>
      </div>

      {/* Row 3: Tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Tenants */}
        <Card className="rounded-xl border-border bg-card p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-bold">Tenants Recentes</h2>
            <Badge variant="secondary" className="text-[10px]">
              {tenants?.length ?? 0} total
            </Badge>
          </div>
          <div className="divide-y divide-border">
            {loadingTenants && (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{tenant.name}</p>
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

        {/* Recent Agents */}
        <Card className="rounded-xl border-border bg-card p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-bold">Agentes</h2>
            <Badge variant="secondary" className="text-[10px]">
              {agents?.length ?? 0} total
            </Badge>
          </div>
          <div className="divide-y divide-border">
            {loadingAgents && (
              <div className="p-5 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))}
              </div>
            )}
            {!loadingAgents && (agents?.length ?? 0) === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nenhum agente cadastrado
              </div>
            )}
            {(agents ?? []).slice(0, 5).map((agent: any, i: number) => (
              <div
                key={agent.id}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Bot className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.model ?? "Sem modelo"}</p>
                  </div>
                </div>
                <Badge
                  className={
                    agent.status === "active"
                      ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                      : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                  }
                >
                  {agent.status === "active" ? "Ativo" : "Pausado"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
