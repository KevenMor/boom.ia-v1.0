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
      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="min-h-[128px] animate-pulse rounded-xl border border-border border-l-[3px] border-l-muted bg-muted/20"
          />
        ))}
      </div>
    );
  }

  const tz = "America/Sao_Paulo";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterdayStr = yesterdayDate.toLocaleDateString("en-CA", { timeZone: tz });

  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { timeZone: tz });
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
      <StatCard
        title="Tokens hoje"
        value={formatTokens(todayTokens)}
        change={tokensDiff ? `${Number(tokensDiff) >= 0 ? "+" : ""}${tokensDiff}% vs. ontem` : "Sem base ontem para comparar"}
        changeType={tokensDiff ? (Number(tokensDiff) <= 0 ? "positive" : "neutral") : "neutral"}
        icon={Zap}
      />
      <StatCard
        title="Latência média"
        value={avgLatency > 0 ? `${(avgLatency / 1000).toFixed(1)} s` : "—"}
        change={
          yesterdayAvgLat > 0 && avgLatency > 0
            ? `${avgLatency >= yesterdayAvgLat ? "+" : ""}${(((avgLatency - yesterdayAvgLat) / yesterdayAvgLat) * 100).toFixed(0)}% vs. ontem`
            : avgLatency > 0
              ? "Conversacional hoje"
              : "Sem amostras com latência hoje"
        }
        changeType={
          yesterdayAvgLat > 0 && avgLatency > 0
            ? avgLatency < yesterdayAvgLat
              ? "positive"
              : avgLatency > yesterdayAvgLat
                ? "negative"
                : "neutral"
            : "neutral"
        }
        icon={Clock}
      />
      <StatCard
        title="Tool calls"
        value={String(todayToolCalls)}
        change={todayToolCalls > 0 ? `${todayRequests} eventos no período` : "Nenhuma tool registrada hoje"}
        changeType="neutral"
        icon={Wrench}
      />
      <StatCard
        title="Requisições"
        value={String(todayRequests)}
        change={`Ontem: ${yesterdayEvents.length} eventos`}
        changeType={todayRequests >= yesterdayEvents.length ? "positive" : "negative"}
        icon={MessageSquare}
      />
    </div>
  );
}
