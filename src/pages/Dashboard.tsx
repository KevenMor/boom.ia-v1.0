import { Building2, MessageSquare, DollarSign, AlertTriangle, Bot, Zap, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const recentActivity = [
  { tenant: "Clínica Saúde+", agent: "Agendamento", messages: 342, status: "healthy" },
  { tenant: "Auto Peças JM", agent: "Suporte", messages: 189, status: "healthy" },
  { tenant: "Imobiliária Lar", agent: "Atendente", messages: 78, status: "warning" },
  { tenant: "Escola Saber", agent: "Matrículas", messages: 56, status: "healthy" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Tenants Ativos"
          value="12"
          change="+2 este mês"
          changeType="positive"
          icon={Building2}
        />
        <StatCard
          title="Mensagens Hoje"
          value="4.832"
          change="+18% vs ontem"
          changeType="positive"
          icon={MessageSquare}
        />
        <StatCard
          title="Custo LLM (mês)"
          value="R$ 1.247"
          change="-5% vs anterior"
          changeType="positive"
          icon={DollarSign}
        />
        <StatCard
          title="Erros (24h)"
          value="3"
          change="0.06%"
          changeType="neutral"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Activity Table */}
        <Card className="col-span-2 border-border bg-card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Atividade por Tenant</h2>
            <span className="text-xs text-muted-foreground">Últimas 24h</span>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/30 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.tenant}</p>
                    <p className="text-xs text-muted-foreground">{item.agent}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono tabular-nums">{item.messages}</span>
                  <Badge
                    variant={item.status === "healthy" ? "default" : "destructive"}
                    className={
                      item.status === "healthy"
                        ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                        : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                    }
                  >
                    {item.status === "healthy" ? "OK" : "Alerta"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Stats */}
        <Card className="border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Resumo Rápido</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                Agentes ativos
              </div>
              <span className="font-mono text-sm font-semibold">24</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                Tool calls hoje
              </div>
              <span className="font-mono text-sm font-semibold">1.293</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Taxa de resolução
              </div>
              <span className="font-mono text-sm font-semibold">92%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                Tempo médio resposta
              </div>
              <span className="font-mono text-sm font-semibold">3.2s</span>
            </div>
          </div>

          {/* Providers status */}
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Providers
            </h3>
            <div className="space-y-2">
              {[
                { name: "OpenAI", status: "online" },
                { name: "Anthropic", status: "online" },
                { name: "Google", status: "online" },
                { name: "DeepSeek", status: "degraded" },
              ].map((p) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{p.name}</span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        p.status === "online" ? "bg-success" : "bg-warning"
                      }`}
                    />
                    <span className="text-xs capitalize">{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
