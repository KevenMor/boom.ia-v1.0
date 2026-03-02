import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

const MODEL_COLORS: Record<string, string> = {
  "gemini": "bg-blue-500",
  "gpt": "bg-emerald-500",
  "claude": "bg-amber-500",
  "llama": "bg-rose-500",
};

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-primary";
}

export function ModelBreakdown({ data, loading }: Props) {
  // Aggregate total tokens per model
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

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Uso por Modelo</h2>
        <p className="text-xs text-muted-foreground">distribuição de tokens</p>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
        </div>
      ) : models.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="space-y-3">
          {models.slice(0, 6).map((m) => {
            const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
            return (
              <div key={m.model}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate max-w-[60%]" title={m.model}>
                    {m.model}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {m.tokens >= 1_000_000 ? `${(m.tokens / 1_000_000).toFixed(1)}M` : m.tokens >= 1000 ? `${(m.tokens / 1000).toFixed(1)}k` : m.tokens} tokens · {m.requests} req
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getModelColor(m.model)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
