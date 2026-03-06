import { Zap, Clock, Wrench, MessageSquare } from "lucide-react";
import { StatCard } from "./StatCard";
import type { UsageDailySummary, UsageEvent } from "@/hooks/useUsageMetrics";

interface Props {
  events: UsageEvent[];
  dailySummary?: UsageDailySummary[];
  loading?: boolean;
}

export function UsageStatsRow({ events, dailySummary = [], loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCard key={i} title="..." value="..." icon={Zap} />
        ))}
      </div>
    );
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const normalizeSummaryDay = (day: string) => day.slice(0, 10);

  const todayEvents = events.filter((e) => getLocalDate(e.created_at) === today);
  const yesterdayEvents = events.filter((e) => getLocalDate(e.created_at) === yesterdayStr);

  const todaySummary = dailySummary.filter((d) => normalizeSummaryDay(d.day) === today);
  const yesterdaySummary = dailySummary.filter((d) => normalizeSummaryDay(d.day) === yesterdayStr);

  const todayTokensFromSummary = todaySummary.reduce((s, d) => s + (d.sum_tokens || 0), 0);
  const yesterdayTokensFromSummary = yesterdaySummary.reduce((s, d) => s + (d.sum_tokens || 0), 0);

  const todayTokensFromEvents = todayEvents.reduce((s, e) => {
    const t = e.total_tokens || ((e.prompt_tokens || 0) + (e.completion_tokens || 0));
    return s + t;
  }, 0);
  const yesterdayTokensFromEvents = yesterdayEvents.reduce((s, e) => {
    const t = e.total_tokens || ((e.prompt_tokens || 0) + (e.completion_tokens || 0));
    return s + t;
  }, 0);

  const todayTokens = todayTokensFromSummary > 0 ? todayTokensFromSummary : todayTokensFromEvents;
  const yesterdayTokens = yesterdayTokensFromSummary > 0 ? yesterdayTokensFromSummary : yesterdayTokensFromEvents;
  const tokensDiff = yesterdayTokens > 0 ? (((todayTokens - yesterdayTokens) / yesterdayTokens) * 100).toFixed(0) : null;

  const convEvents = todayEvents.filter((e) => e.phase === "conversational" && e.latency_ms);
  const avgLatency = convEvents.length > 0
    ? Math.round(convEvents.reduce((s, e) => s + (e.latency_ms || 0), 0) / convEvents.length)
    : 0;
  const yesterdayConv = yesterdayEvents.filter((e) => e.phase === "conversational" && e.latency_ms);
  const yesterdayAvgLat = yesterdayConv.length > 0
    ? Math.round(yesterdayConv.reduce((s, e) => s + (e.latency_ms || 0), 0) / yesterdayConv.length)
    : 0;

  const todayToolCallsFromSummary = todaySummary.reduce((s, d) => s + (d.sum_tool_calls || 0), 0);
  const todayToolCallsFromEvents = todayEvents.reduce((s, e) => s + (e.tool_calls_count || 0), 0);
  const todayToolCalls = todayToolCallsFromSummary > 0 ? todayToolCallsFromSummary : todayToolCallsFromEvents;

  const todayRequests = todayEvents.length;

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  // Generate simple spark data from last 7 days of dailySummary
  const last7 = dailySummary
    .map((d) => d.sum_tokens || 0)
    .slice(-9);
  const spark1 = last7.length > 2 ? last7 : [25, 44, 30, 56, 40, 50, 13, 24, 84];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Tokens Hoje"
        value={formatTokens(todayTokens)}
        change={tokensDiff ? `${Number(tokensDiff) >= 0 ? "+" : ""}${tokensDiff}% vs ontem` : "Sem dados de ontem"}
        changeType={tokensDiff ? (Number(tokensDiff) <= 0 ? "positive" : "neutral") : "neutral"}
        icon={Zap}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        sparkData={spark1}
        sparkColor="hsl(var(--primary))"
      />
      <StatCard
        title="Latência Média"
        value={avgLatency > 0 ? `${(avgLatency / 1000).toFixed(1)}s` : "—"}
        change={yesterdayAvgLat > 0 ? `${((avgLatency - yesterdayAvgLat) / 1000).toFixed(1)}s vs ontem` : "Sem referência"}
        changeType={avgLatency < yesterdayAvgLat ? "positive" : avgLatency > yesterdayAvgLat ? "negative" : "neutral"}
        icon={Clock}
        iconBg="bg-primary-tint1/10"
        iconColor="text-primary-tint1"
        sparkColor="hsl(var(--primary-tint1))"
      />
      <StatCard
        title="Tool Calls Hoje"
        value={String(todayToolCalls)}
        change={`${todayRequests} requisições`}
        changeType="neutral"
        icon={Wrench}
        iconBg="bg-primary-tint2/10"
        iconColor="text-primary-tint2"
        sparkColor="hsl(var(--primary-tint2))"
      />
      <StatCard
        title="Requisições Hoje"
        value={String(todayRequests)}
        change={`${yesterdayEvents.length} ontem`}
        changeType={todayRequests >= yesterdayEvents.length ? "positive" : "negative"}
        icon={MessageSquare}
        iconBg="bg-primary-tint3/10"
        iconColor="text-primary-tint3"
        sparkColor="hsl(var(--primary-tint3))"
      />
    </div>
  );
}
