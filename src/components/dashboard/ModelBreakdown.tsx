import { Skeleton } from "@/components/ui/skeleton";
import { Cpu } from "lucide-react";
import type { UsageDailySummary } from "@/hooks/useUsageMetrics";
import { useRef, useCallback } from "react";

interface Props {
  data: UsageDailySummary[];
  loading?: boolean;
}

const MODEL_COLORS: Record<string, string> = {
  gemini: "from-blue-500 to-cyan-400",
  gpt: "from-emerald-500 to-green-400",
  claude: "from-amber-500 to-yellow-400",
  llama: "from-rose-500 to-pink-400",
};

const MODEL_BAR_COLORS: Record<string, string> = {
  gemini: "bg-blue-500",
  gpt: "bg-emerald-500",
  claude: "bg-amber-500",
  llama: "bg-rose-500",
};

function getModelGradient(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "from-primary to-primary/60";
}

function getModelBarColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_BAR_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-primary";
}

export function ModelBreakdown({ data, loading }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    cardRef.current!.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    cardRef.current!.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

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
    <div ref={cardRef} onMouseMove={handleMouseMove} className="dash-card">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Cpu className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Uso por Modelo</h2>
          <p className="text-[11px] text-muted-foreground">distribuição de tokens</p>
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : models.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="space-y-3">
          {models.slice(0, 6).map((m, idx) => {
            const pct = ((m.tokens / totalTokens) * 100).toFixed(1);
            return (
              <div key={m.model} className="group">
                <div className="flex items-center gap-2.5 mb-1.5">
                  {/* Color dot */}
                  <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${getModelGradient(m.model)} shrink-0`} />
                  <span className="text-xs font-medium truncate flex-1" title={m.model}>
                    {m.model}
                  </span>
                  <span className="metric-value text-[11px] text-muted-foreground shrink-0">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getModelBarColor(m.model)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
                  <span>{m.tokens >= 1_000_000 ? `${(m.tokens / 1_000_000).toFixed(1)}M` : m.tokens >= 1000 ? `${(m.tokens / 1000).toFixed(1)}k` : m.tokens} tokens</span>
                  <span>· {m.requests} req</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
