import { Zap, Clock, Wrench, MessageSquare } from "lucide-react";
import { StatCard } from "./StatCard";
import type { UsageEvent } from "@/hooks/useUsageMetrics";

interface Props {
  events: UsageEvent[];
  loading?: boolean;
}

export function UsageStatsRow({ events, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCard key={i} title="..." value="..." icon={Zap} />
        ))}
      </div>
    );
  }

  // Use local date (not UTC) to match the user's timezone (e.g. BRT)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  // Convert event created_at to local date for comparison
  const getLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const todayEvents = events.filter((e) => getLocalDate(e.created_at) === today);
  const yesterdayEvents = events.filter((e) => getLocalDate(e.created_at) === yesterdayStr);

  // Total tokens today — use total_tokens if available, fallback to prompt + completion
  const todayTokens = todayEvents.reduce((s, e) => {
    const t = e.total_tokens || ((e.prompt_tokens || 0) + (e.completion_tokens || 0));
    return s + t;
  }, 0);
  const yesterdayTokens = yesterdayEvents.reduce((s, e) => {
    const t = e.total_tokens || ((e.prompt_tokens || 0) + (e.completion_tokens || 0));
    return s + t;
  }, 0);
  const tokensDiff = yesterdayTokens > 0 ? (((todayTokens - yesterdayTokens) / yesterdayTokens) * 100).toFixed(0) : null;

  // Debug: log a sample event to verify field names
  if (todayEvents.length > 0) {
    console.log("[UsageStatsRow] sample event:", JSON.stringify(todayEvents[0]));
    console.log("[UsageStatsRow] todayEvents count:", todayEvents.length, "todayTokens:", todayTokens);
  }

  // Avg latency today (conversational only)
  const convEvents = todayEvents.filter((e) => e.phase === "conversational" && e.latency_ms);
  const avgLatency = convEvents.length > 0
    ? Math.round(convEvents.reduce((s, e) => s + (e.latency_ms || 0), 0) / convEvents.length)
    : 0;
  const yesterdayConv = yesterdayEvents.filter((e) => e.phase === "conversational" && e.latency_ms);
  const yesterdayAvgLat = yesterdayConv.length > 0
    ? Math.round(yesterdayConv.reduce((s, e) => s + (e.latency_ms || 0), 0) / yesterdayConv.length)
    : 0;

  // Tool calls today
  const todayToolCalls = todayEvents.reduce((s, e) => s + (e.tool_calls_count || 0), 0);

  // Total requests today
  const todayRequests = todayEvents.length;

  const formatTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Tokens Hoje"
        value={formatTokens(todayTokens)}
        change={tokensDiff ? `${Number(tokensDiff) >= 0 ? "+" : ""}${tokensDiff}% vs ontem` : "Sem dados de ontem"}
        changeType={tokensDiff ? (Number(tokensDiff) <= 0 ? "positive" : "neutral") : "neutral"}
        icon={Zap}
        iconBg="bg-primary/10"
        iconColor="text-primary"
      />
      <StatCard
        title="Latência Média"
        value={avgLatency > 0 ? `${(avgLatency / 1000).toFixed(1)}s` : "—"}
        change={yesterdayAvgLat > 0 ? `${((avgLatency - yesterdayAvgLat) / 1000).toFixed(1)}s vs ontem` : "Sem referência"}
        changeType={avgLatency < yesterdayAvgLat ? "positive" : avgLatency > yesterdayAvgLat ? "negative" : "neutral"}
        icon={Clock}
        iconBg="bg-warning/10"
        iconColor="text-warning"
      />
      <StatCard
        title="Tool Calls Hoje"
        value={String(todayToolCalls)}
        change={`${todayRequests} requisições`}
        changeType="neutral"
        icon={Wrench}
        iconBg="bg-success/10"
        iconColor="text-success"
      />
      <StatCard
        title="Requisições Hoje"
        value={String(todayRequests)}
        change={`${yesterdayEvents.length} ontem`}
        changeType={todayRequests >= yesterdayEvents.length ? "positive" : "negative"}
        icon={MessageSquare}
        iconBg="bg-cyan-500/10"
        iconColor="text-cyan-500"
      />
    </div>
  );
}
