import { MessageSquare, Bot, Wallet, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsageEvent } from "@/hooks/useUsageMetrics";
import { estimateCostUsd } from "@/hooks/useTokensByAgent";

interface Props {
  events: UsageEvent[];
  activeAgents: number;
  totalAgents: number;
  conversationDelta?: number | null;
  loading?: boolean;
}

function fmtBrl(usd: number): string {
  const brl = usd * 5.2;
  if (brl < 0.01) return "R$ 0,00";
  return brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function OpsKpiStrip({
  events,
  activeAgents,
  totalAgents,
  conversationDelta,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="tu-kpi h-[112px] animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  const tz = "America/Sao_Paulo";
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: tz });
  const yesterday = new Date(now.getTime() - 86400000).toLocaleDateString("en-CA", { timeZone: tz });
  const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

  const todayEvents = events.filter((e) => localDay(e.created_at) === today);
  const yesterdayEvents = events.filter((e) => localDay(e.created_at) === yesterday);

  let todayCost = 0;
  let yesterdayCost = 0;
  for (const e of todayEvents) {
    todayCost += estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
  }
  for (const e of yesterdayEvents) {
    yesterdayCost += estimateCostUsd(e.prompt_tokens || 0, e.completion_tokens || 0, e.model || "");
  }

  const withLatency = todayEvents.filter((e) => e.latency_ms);
  const avgLatency =
    withLatency.length > 0
      ? Math.round(withLatency.reduce((s, e) => s + (e.latency_ms || 0), 0) / withLatency.length)
      : 0;

  const reqDiff =
    yesterdayEvents.length > 0
      ? Math.round(((todayEvents.length - yesterdayEvents.length) / yesterdayEvents.length) * 100)
      : null;
  const costDiff =
    yesterdayCost > 1e-9 ? Math.round(((todayCost - yesterdayCost) / yesterdayCost) * 100) : null;
  const utilPct = totalAgents > 0 ? Math.min(100, Math.round((activeAgents / totalAgents) * 100)) : 0;

  const items = [
    {
      key: "conversations",
      label: "Atividade hoje",
      value: String(todayEvents.length),
      hint:
        conversationDelta != null
          ? `${conversationDelta >= 0 ? "+" : ""}${conversationDelta}% conversas no período`
          : reqDiff != null
            ? `${reqDiff >= 0 ? "+" : ""}${reqDiff}% vs. ontem`
            : "Requisições no dia",
      hintTone: (reqDiff ?? 0) >= 0 ? "up" : "down",
      icon: MessageSquare,
    },
    {
      key: "agents",
      label: "Agentes ativos",
      value: String(activeAgents),
      hint: totalAgents > 0 ? `${utilPct}% da capacidade · ${totalAgents} no total` : "Nenhum agente",
      hintTone: "neutral" as const,
      icon: Bot,
    },
    {
      key: "cost",
      label: "Custo estimado",
      value: fmtBrl(todayCost),
      hint: costDiff != null ? `${costDiff >= 0 ? "+" : ""}${costDiff}% vs. ontem` : "Sem base ontem",
      hintTone: costDiff == null ? "neutral" : costDiff > 0 ? "down" : "up",
      icon: Wallet,
    },
    {
      key: "latency",
      label: "Latência média",
      value: fmtLatency(avgLatency),
      hint: withLatency.length > 0 ? `${withLatency.length} amostras hoje` : "Sem amostras com latência",
      hintTone: "neutral" as const,
      icon: Activity,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="tu-kpi flex min-h-[108px] flex-col px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="tu-label">{item.label}</span>
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="tu-value text-[1.375rem] sm:text-[1.5rem]">{item.value}</p>
            <p
              className={cn(
                "tu-hint mt-auto pt-2",
                item.hintTone === "up" && "tu-hint-up",
                item.hintTone === "down" && "tu-hint-down",
              )}
            >
              {item.hint}
            </p>
          </div>
        );
      })}
    </div>
  );
}
