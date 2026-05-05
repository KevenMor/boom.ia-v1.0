import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ArrowUpRight, ArrowDownRight, Activity, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { AgentTokenSummary } from "@/hooks/useTokensByAgent";
import { type DashboardVisual, cwSeriesColor } from "@/lib/dashboard-visual";
import type { Agent } from "@/types/database";

interface Props {
  data: AgentTokenSummary[];
  loading?: boolean;
  visual?: DashboardVisual;
  presentation?: "cards" | "table";
  /** Filtro de texto (nome do agente / tenant) quando `presentation="table"`. */
  filterQuery?: string;
  /** Ao definir junto com `filterQuery`, exibe campo de busca no cabeçalho da tabela. */
  onFilterQueryChange?: (value: string) => void;
  /** Opcional: status do agente por id (ativo / pausado). */
  agentsCatalog?: Agent[];
  /** Cartão/tableau estilo export Stitch (glass + cores). */
  stitchTableChrome?: boolean;
}
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  const brl = usd * 5.2;
  if (brl < 0.01) return "< R$ 0,01";
  return `R$ ${brl.toFixed(2).replace(".", ",")}`;
}

const AGENT_COLORS = [
  "bg-primary",
  "bg-primary-tint1",
  "bg-primary-tint2",
  "bg-primary-tint3",
  "bg-secondary",
  "bg-info",
];

function agentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase() || "•";
}

function statusForRow(agentId: string, catalog?: Agent[]): "active" | "paused" {
  const row = catalog?.find((a) => a.id === agentId);
  if (!row) return "active";
  return row.status === "active" ? "active" : "paused";
}

const CW_AVATAR_STYLES = [
  "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  "bg-cw-alpha text-cw-brand",
  "bg-[rgba(229,70,102,0.12)] text-red-800 dark:text-red-300",
  "bg-amber-500/15 text-amber-900 dark:text-amber-200",
] as const;

export function AgentTokenBreakdown({
  data,
  loading,
  visual = "default",
  presentation = "cards",
  filterQuery = "",
  agentsCatalog,
  onFilterQueryChange,
  stitchTableChrome,
}: Props) {
  const totalCost = data.reduce((s, a) => s + a.estimated_cost_usd, 0);
  const totalTokensAll = data.reduce((s, a) => s + a.prompt_tokens + a.completion_tokens, 0) || 1;

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (row) =>
        row.agent_name.toLowerCase().includes(q) ||
        row.tenant_name.toLowerCase().includes(q) ||
        row.models_used.some((m) => m.toLowerCase().includes(q)),
    );
  }, [data, filterQuery]);

  const showTable = presentation === "table" && visual !== "cw";
  const stitchChrome = Boolean(stitchTableChrome && showTable);

  const rootClass = stitchChrome
    ? "glass-card flex h-full min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-soft dark:border-border dark:bg-card/40"
    : "box h-full";
  const headClass = stitchChrome
    ? "flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-border"
    : cn("justify-between", "box-header");

  return (
    <div className={rootClass}>
      <div className={headClass}>
        <div className="flex items-center gap-2.5">
          {stitchChrome ? (
            <h2 className="text-[1.125rem] font-semibold tracking-tight text-[#0f172a] dark:text-foreground">Tokens por agente</h2>
          ) : (
          <>
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"
            }
          >
            <Activity className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary"} />
          </span>
          <div>
            <span className="box-title">Tokens por Agente</span>
            <p className={visual === "cw" ? "text-[11px] text-cw-slate-10" : "text-[11px] text-muted-foreground"}>
              entrada vs saída — últimos 7 dias
            </p>
          </div>
          </>
          )}
        </div>
        {showTable ? (
          onFilterQueryChange ? (
            <div className="relative hidden min-w-[12rem] max-w-[224px] group sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#64748b] group-focus-within:text-[#7c3aed]" />
              <Input
                value={filterQuery}
                onChange={(e) => onFilterQueryChange(e.target.value)}
                placeholder="Buscar agentes..."
                className={
                  stitchChrome
                    ? "h-9 rounded-lg border border-slate-200/60 bg-slate-50 py-1.5 pl-9 pr-4 text-sm text-[#0f172a] outline-none placeholder:text-[#64748b]/70 focus-visible:ring-2 focus-visible:ring-[#7c3aed]/20 dark:border-border dark:bg-muted/40 dark:text-foreground"
                    : "h-9 rounded-lg border-border/70 bg-muted/40 py-1.5 pl-9 text-sm shadow-sm focus-visible:ring-[#7c3aed]/20"
                }
              />
            </div>
          ) : null
        ) : (
          <div className="text-right">
            <p
              className={
                visual === "cw"
                  ? "text-[10px] uppercase tracking-wider text-cw-slate-10"
                  : "text-[10px] text-muted-foreground uppercase tracking-wider"
              }
            >
              Custo total
            </p>
            <p
              className={
                visual === "cw" ? "metric-value text-base font-bold text-cw-brand" : "metric-value text-base font-bold gradient-text"
              }
            >
              {fmtCost(totalCost)}
            </p>
          </div>
        )}
      </div>

      <div
        className={
          stitchChrome && showTable
            ? "custom-scrollbar flex-1 overflow-auto p-0"
            : (visual === "cw" && !loading && data.length > 0) || showTable
              ? "box-body !p-0"
              : "box-body"
        }
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : data.length === 0 ? (
          <div
            className={
              visual === "cw" ? "py-10 text-center text-sm text-cw-slate-10" : "py-10 text-center text-sm text-muted-foreground"
            }
          >
            Sem dados de uso
          </div>
        ) : visual === "cw" ? (
          <div className="divide-y divide-cw-weak">
            {data.map((agent, idx) => {
              const totalTk = (agent.prompt_tokens + agent.completion_tokens) || 1;
              const inputPct = ((agent.prompt_tokens / totalTk) * 100).toFixed(0);
              const outputPct = ((agent.completion_tokens / totalTk) * 100).toFixed(0);
              const sharePct = ((agent.prompt_tokens + agent.completion_tokens) / totalTokensAll) * 100;
              const barColor = cwSeriesColor(idx);

              return (
                <div
                  key={agent.agent_id}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-cw-solid-2 sm:px-5 sm:py-3.5"
                >
                  <div
                    className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${CW_AVATAR_STYLES[idx % CW_AVATAR_STYLES.length]}`}
                  >
                    {agent.agent_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-cw-slate-12">{agent.agent_name}</p>
                        <p className="truncate text-xs text-cw-slate-10">{agent.tenant_name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-cw-slate-12">{fmt(agent.total_tokens)}</p>
                        <p className="text-xs text-cw-slate-10">{fmtCost(agent.estimated_cost_usd)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cw-solid-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, Math.max(0, sharePct)).toFixed(2)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-cw-slate-10">
                      <span>{sharePct.toFixed(0)}% do total</span>
                      <span className="font-mono tabular-nums">{agent.total_requests} req</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-cw-slate-10">
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowUpRight className="h-2.5 w-2.5 text-cw-brand" />
                        {fmt(agent.prompt_tokens)} ({inputPct}% in)
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowDownRight className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                        {fmt(agent.completion_tokens)} ({outputPct}% out)
                      </span>
                      {agent.tool_calls > 0 && <span>{agent.tool_calls} tools</span>}
                    </div>
                    {agent.models_used.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {agent.models_used.map((m) => (
                          <span
                            key={m}
                            className="rounded-md border border-cw-weak bg-[rgba(0,0,0,0.12)] px-1.5 py-0.5 font-mono text-[9px] text-cw-slate-10 dark:bg-black/20"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : showTable ? (
          <div
            className={
              stitchChrome
                ? "max-h-[min(560px,calc(100vh-18rem))] min-h-[200px]"
                : "dashboard-premium-scrollbar max-h-[min(520px,calc(100vh-24rem))]"
            }
          >
            <table className="relative w-full border-collapse text-left">
              <thead
                className={cn(
                  "sticky top-0 z-10 backdrop-blur-sm",
                  stitchChrome ? "border-b border-slate-100 bg-white/95 dark:bg-card/95" : "border-b border-border bg-card/95",
                )}
              >
                <tr
                  className={cn(
                    "border-b uppercase tracking-widest",
                    stitchChrome ? "border-slate-100 text-[10px] font-semibold text-[#64748b]" : "text-[10px] font-semibold text-muted-foreground",
                  )}
                >
                  <th className="whitespace-nowrap p-4">Agente</th>
                  <th className="whitespace-nowrap p-4 text-right">Tokens</th>
                  <th className="whitespace-nowrap p-4 text-right">Custo ($)</th>
                  <th className="whitespace-nowrap p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className={stitchChrome ? "text-[15px] text-[#0f172a] dark:text-foreground" : "text-sm text-foreground"}>
                {filtered.map((agent, idx) => {
                  const st = statusForRow(agent.agent_id, agentsCatalog);
                  const stitchMarks = [
                    "rounded-xl bg-[#7c3aed]/10 text-[#7c3aed]",
                    "rounded-xl bg-[#ec4899]/10 text-[#ec4899]",
                    "rounded-xl bg-slate-200 text-slate-600 dark:bg-muted dark:text-muted-foreground",
                  ];
                  const colorClass = stitchChrome ? stitchMarks[idx % stitchMarks.length] : AGENT_COLORS[idx % AGENT_COLORS.length];
                  const usd = agent.estimated_cost_usd;
                  const cellBox = stitchChrome ? `${colorClass} flex h-9 w-9 shrink-0 items-center justify-center font-bold shadow-sm transition-transform group-hover:scale-105` : cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm transition-transform group-hover:scale-105", colorClass);
                  return (
                    <tr
                      key={agent.agent_id}
                      className={cn(
                        "group border-b transition-colors last:border-0",
                        stitchChrome ? "border-slate-50 hover:bg-slate-50/80 dark:border-border/60 dark:hover:bg-muted/40" : "border-border/60 hover:bg-muted/50",
                      )}
                    >
                      <td className="p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cellBox}>{agentInitials(agent.agent_name)}</div>
                          <span
                            className={cn(
                              "max-w-[10rem] truncate font-semibold sm:max-w-[14rem]",
                              stitchChrome && "text-[15px] text-[#0f172a] dark:text-foreground",
                            )}
                            title={agent.agent_name}
                          >
                            {agent.agent_name}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "p-4 text-right font-medium",
                          stitchChrome ? "text-[#64748b]" : "text-muted-foreground",
                        )}
                      >
                        {fmt(agent.total_tokens)}
                      </td>
                      <td
                        className={cn(
                          "p-4 text-right font-semibold",
                          stitchChrome ? "text-[#0f172a] dark:text-foreground" : undefined,
                        )}
                      >
                        {usd < 0.01 ? "—" : `$${usd.toLocaleString("en-US", { minimumFractionDigits: usd >= 100 ? 0 : 2, maximumFractionDigits: 2 })}`}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                            st === "active"
                              ? stitchChrome
                                ? "bg-[#0d9488]/10 text-[#0d9488]"
                                : "bg-[#0d9488]/10 text-[#0d9488]"
                              : stitchChrome
                                ? "bg-slate-100 text-slate-500 dark:bg-muted dark:text-muted-foreground"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {st === "active" ? "Ativo" : "Pausado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">Nenhum agente encontrado neste filtro.</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((agent, idx) => {
              const totalTk = (agent.prompt_tokens + agent.completion_tokens) || 1;
              const inputPct = ((agent.prompt_tokens / totalTk) * 100).toFixed(0);
              const outputPct = ((agent.completion_tokens / totalTk) * 100).toFixed(0);
              const colorClass = AGENT_COLORS[idx % AGENT_COLORS.length];

              return (
                <div
                  key={agent.agent_id}
                  className="rounded-lg border border-border p-3.5 transition-all hover:border-primary/20 hover:shadow-sm"
                >
                  <div className="mb-2.5 flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colorClass} text-xs font-bold text-white`}
                    >
                      {agent.agent_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{agent.agent_name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{agent.tenant_name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="metric-value text-sm font-bold">{fmt(agent.total_tokens)}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtCost(agent.estimated_cost_usd)}</p>
                    </div>
                  </div>

                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-l-full bg-primary transition-all duration-700"
                      style={{ width: `${inputPct}%` }}
                    />
                    <div
                      className="h-full rounded-r-full bg-success transition-all duration-700"
                      style={{ width: `${outputPct}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <ArrowUpRight className="h-2.5 w-2.5 text-primary" />
                      {fmt(agent.prompt_tokens)} ({inputPct}%)
                    </span>
                    <span className="flex items-center gap-0.5">
                      <ArrowDownRight className="h-2.5 w-2.5 text-success" />
                      {fmt(agent.completion_tokens)} ({outputPct}%)
                    </span>
                    <span className="ml-auto font-mono">{agent.total_requests} req</span>
                    {agent.tool_calls > 0 && <span className="font-mono">{agent.tool_calls} tools</span>}
                  </div>

                  {agent.models_used.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {agent.models_used.map((m) => (
                        <span
                          key={m}
                          className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
