import {
  Building2,
  Bot,
  Zap,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  BarChart3,
  ShoppingCart,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { HighlightCard } from "@/components/dashboard/HighlightCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const areaData = [
  { month: "Jan", conversas: 120 },
  { month: "Fev", conversas: 180 },
  { month: "Mar", conversas: 240 },
  { month: "Abr", conversas: 310 },
  { month: "Mai", conversas: 280 },
  { month: "Jun", conversas: 390 },
  { month: "Jul", conversas: 450 },
  { month: "Ago", conversas: 410 },
  { month: "Set", conversas: 520 },
  { month: "Out", conversas: 480 },
  { month: "Nov", conversas: 560 },
  { month: "Dez", conversas: 620 },
];

export default function Dashboard() {
  const { data: tenants, isLoading: loadingTenants } = useTenants();
  const { data: agents, isLoading: loadingAgents } = useAgents();
  const { data: providers, isLoading: loadingProviders } = useProviders();

  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const activeAgents = agents?.filter((a) => a.status === "active").length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <p className="text-xs text-muted-foreground">Dashboards → Nexus AI</p>
        <h1 className="text-xl font-bold">Nexus AI</h1>
      </div>

      {/* Row 1 — Stat cards (Xintra style: icon circle top, value bottom-left, badge bottom-right) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Tenants Ativos"
          value={loadingTenants ? "..." : String(activeTenants)}
          change={`${tenants?.length ?? 0} total`}
          changeType="neutral"
          icon={Building2}
          iconBg="bg-blue-100 dark:bg-blue-500/15"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Agentes Ativos"
          value={loadingAgents ? "..." : String(activeAgents)}
          change={`${totalAgents} total`}
          changeType="neutral"
          icon={Users}
          iconBg="bg-violet-100 dark:bg-violet-500/15"
          iconColor="text-violet-600 dark:text-violet-400"
        />
        <StatCard
          title="Providers"
          value={loadingProviders ? "..." : String(providers?.length ?? 0)}
          change="Configurados"
          changeType="neutral"
          icon={Zap}
          iconBg="bg-amber-100 dark:bg-amber-500/15"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          title="Conversas"
          value="—"
          change="Sem dados"
          changeType="neutral"
          icon={MessageSquare}
          iconBg="bg-pink-100 dark:bg-pink-500/15"
          iconColor="text-pink-600 dark:text-pink-400"
        />
        <StatCard
          title="Erros (24h)"
          value="0"
          change="Estável"
          changeType="positive"
          icon={AlertTriangle}
          iconBg="bg-emerald-100 dark:bg-emerald-500/15"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* Row 2 — Highlight cards + Area Chart + Side stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Two highlight cards stacked */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <HighlightCard
            title="Total de Agentes"
            value={loadingAgents ? "..." : String(totalAgents)}
            change={`${activeAgents} ativos`}
            icon={Bot}
            gradient="from-primary to-primary/80"
          />
          <HighlightCard
            title="Tenants"
            value={loadingTenants ? "..." : String(tenants?.length ?? 0)}
            change={`${activeTenants} ativos`}
            icon={Building2}
            gradient="from-emerald-600 to-emerald-500"
          />
        </div>

        {/* Center: Area Chart */}
        <Card className="lg:col-span-6 rounded-xl border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Visão Geral</h2>
              <p className="text-xs text-muted-foreground">Conversas por mês</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" /> Conversas
              </span>
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="gradConversas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 72%, 58%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(217, 72%, 58%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
                <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Area type="monotone" dataKey="conversas" stroke="hsl(217, 72%, 58%)" strokeWidth={2} fillOpacity={1} fill="url(#gradConversas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Right: Side stats list (Xintra "Profit By Sale" style) */}
        <Card className="lg:col-span-3 rounded-xl border-border bg-card p-5">
          <h2 className="text-sm font-bold">Resumo Rápido</h2>
          <p className="mb-4 text-xs text-muted-foreground">Métricas principais</p>
          <div className="space-y-4">
            {[
              { label: "Agentes Ativos", val: loadingAgents ? "..." : String(activeAgents), sub: "Em operação", color: "bg-blue-500", icon: Bot },
              { label: "Providers", val: loadingProviders ? "..." : String(providers?.length ?? 0), sub: "Configurados", color: "bg-amber-500", icon: Zap },
              { label: "Tenants", val: loadingTenants ? "..." : String(activeTenants), sub: "Ativos", color: "bg-emerald-500", icon: Building2 },
              { label: "Conversas", val: "—", sub: "Em breve", color: "bg-violet-500", icon: MessageSquare },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.color}/10`}>
                  <item.icon className={`h-4 w-4 ${item.color.replace("bg-", "text-")}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                </div>
                <span className="text-sm font-bold">{item.val}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Tables side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tenants */}
        <Card className="overflow-hidden rounded-xl border-border bg-card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-bold">Tenants Recentes</h2>
            <Badge variant="secondary" className="text-[10px]">{tenants?.length ?? 0} total</Badge>
          </div>
          <div className="divide-y divide-border">
            {loadingTenants && (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            )}
            {!loadingTenants && (tenants?.length ?? 0) === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum tenant cadastrado</div>
            )}
            {(tenants ?? []).slice(0, 5).map((tenant) => (
              <div key={tenant.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/15">
                    <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  </div>
                </div>
                <Badge className={tenant.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"}>
                  {tenant.status === "active" ? "Ativo" : tenant.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Agentes */}
        <Card className="overflow-hidden rounded-xl border-border bg-card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-bold">Agentes</h2>
            <Badge variant="secondary" className="text-[10px]">{agents?.length ?? 0} total</Badge>
          </div>
          <div className="divide-y divide-border">
            {loadingAgents && (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            )}
            {!loadingAgents && (agents?.length ?? 0) === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhum agente cadastrado</div>
            )}
            {(agents ?? []).slice(0, 5).map((agent: any) => (
              <div key={agent.id} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/15">
                    <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.model ?? "Sem modelo"}</p>
                  </div>
                </div>
                <Badge className={agent.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"}>
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
