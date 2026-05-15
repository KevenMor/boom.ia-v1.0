import { Skeleton } from "@/components/ui/skeleton";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
  visual?: string;
  premiumStitch?: boolean;
}

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--info))",
  "hsl(var(--muted-foreground))",
  "hsl(217 30% 50%)",
  "hsl(220 15% 40%)",
  "hsl(215 20% 55%)",
];

export function ModelBreakdown({ data, loading }: Props) {
  const byModel = new Map<string, { tokens: number; requests: number }>();
  for (const row of data) {
    const model = row.model || "unknown";
    const existing = byModel.get(model) || { tokens: 0, requests: 0 };
    existing.tokens += row.sum_tokens || 0;
    existing.requests += row.total_requests || 0;
    byModel.set(model, existing);
  }

  const models = Array.from(byModel.entries())
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.tokens - a.tokens);

  const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0) || 1;
  const maxTokens = models[0]?.tokens || 1;

  function fmt(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[300px] flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl border border-border bg-card p-5 shadow-sm">
        <span className="text-sm text-muted-foreground">Sem dados</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[300px] flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-md font-medium text-foreground">Uso por modelo</h3>
        <p className="text-xs text-muted-foreground">Distribuição de tokens</p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3">
        {models.slice(0, 6).map((m, idx) => {
          const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
          const barWidth = (m.tokens / maxTokens) * 100;
          return (
            <div key={m.model} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-foreground" title={m.model}>
                  {m.model}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmt(m.tokens)}</span>
                  <span className="text-xs font-medium text-foreground">{pct}%</span>
                </div>
              </div>
              <div className="h-2 w-full rounded-sm bg-muted">
                <div
                  className="h-full rounded-sm transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
