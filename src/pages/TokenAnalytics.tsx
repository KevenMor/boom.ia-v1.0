import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BarChart3, PieChart as PieIcon, TrendingUp, DollarSign } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  useTokenUsageByDay,
  useTokenUsageByAgent,
  useTokenUsageByModel,
} from "@/hooks/useAgentTokenUsage";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--primary) / 0.7)", "hsl(var(--primary) / 0.5)", "#22c55e", "#eab308", "#ef4444"];

export default function TokenAnalytics() {
  const { selectedTenantId } = useTenantContext();
  const [days, setDays] = useState("30");

  const { data: byDay, isLoading: loadingDay } = useTokenUsageByDay(Number(days), selectedTenantId);
  const { data: byAgent, isLoading: loadingAgent } = useTokenUsageByAgent(Number(days), selectedTenantId);
  const { data: byModel, isLoading: loadingModel } = useTokenUsageByModel(Number(days), selectedTenantId);

  const chartData = (byDay ?? []).map((d) => ({
    ...d,
    dayLabel: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
  }));

  const totalTokens = (byDay ?? []).reduce((s, d) => s + d.total_tokens, 0);
  const totalCost = (byAgent ?? []).reduce((s, d) => s + d.estimated_cost_usd, 0);
  const totalRequests = (byDay ?? []).reduce((s, d) => s + d.requests, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Analytics de Tokens</h1>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="14">Últimos 14 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm">Total de Tokens</span>
          </div>
          {loadingDay ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold">{totalTokens.toLocaleString()}</p>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="text-sm">Custo Estimado</span>
          </div>
          {loadingAgent ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold">${totalCost.toFixed(4)} USD</p>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm">Chamadas LLM</span>
          </div>
          {loadingDay ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold">{totalRequests.toLocaleString()}</p>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <PieIcon className="h-4 w-4" />
            <span className="text-sm">Modelos Usados</span>
          </div>
          {loadingModel ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 text-2xl font-bold">{(byModel ?? []).length}</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold">Tokens por Dia</h2>
          {loadingDay ? (
            <Skeleton className="h-[280px] w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              Nenhum dado de uso ainda
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="dayLabel" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" />
                  <YAxis axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [value.toLocaleString(), "Tokens"]}
                    labelFormatter={(label) => label}
                  />
                  <Area type="monotone" dataKey="total_tokens" stroke="hsl(var(--primary))" fill="url(#gradTokens)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-4 text-sm font-semibold">Tokens por Modelo</h2>
          {loadingModel ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (byModel ?? []).length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              Nenhum dado de uso ainda
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byModel ?? []}
                    dataKey="total_tokens"
                    nameKey="model"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ model, total_tokens }) => `${model?.slice(0, 12) ?? "?"} (${(total_tokens / 1000).toFixed(0)}k)`}
                  >
                    {(byModel ?? []).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number, name: string, props: { payload: { estimated_cost_usd: number } }) => [
                      `${value.toLocaleString()} tokens (~$${props.payload.estimated_cost_usd.toFixed(4)})`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold">Tokens por Agente</h2>
        {loadingAgent ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (byAgent ?? []).length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Nenhum dado de uso ainda
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAgent ?? []} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <YAxis type="category" dataKey="agent_name" width={120} axisLine={false} tickLine={false} className="text-[11px] fill-muted-foreground" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(value: number, name: string, props: { payload: { total_tokens: number; requests: number; estimated_cost_usd: number } }) => [
                    `${value.toLocaleString()} tokens · ${props.payload.requests} chamadas · ~$${props.payload.estimated_cost_usd.toFixed(4)}`,
                    name,
                  ]}
                />
                <Bar dataKey="total_tokens" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Tokens" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-4 text-sm font-semibold">Conversas com Maior Consumo</h2>
        <p className="text-sm text-muted-foreground">
          Dados agregados por agente. Para detalhes por conversa, consulte a tabela agent_token_usage no banco.
        </p>
      </Card>
    </div>
  );
}
