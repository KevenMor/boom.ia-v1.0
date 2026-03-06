import { Skeleton } from "@/components/ui/skeleton";
import { Server } from "lucide-react";
import type { ProviderTokenSummary } from "@/hooks/useTokensByProvider";
import { useRef, useCallback } from "react";

interface Props {
  data: ProviderTokenSummary[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

const PROVIDER_GRADIENTS: Record<string, string> = {
  openai: "from-emerald-500 to-green-400",
  google: "from-blue-500 to-sky-400",
  anthropic: "from-amber-500 to-yellow-400",
  lovable: "from-violet-500 to-purple-400",
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500",
  google: "bg-blue-500",
  anthropic: "bg-amber-500",
  lovable: "bg-violet-500",
};

function getProviderGradient(provider: string): string {
  const lower = provider.toLowerCase();
  for (const [key, color] of Object.entries(PROVIDER_GRADIENTS)) {
    if (lower.includes(key)) return color;
  }
  return "from-primary to-primary/60";
}

function getProviderColor(provider: string): string {
  const lower = provider.toLowerCase();
  for (const [key, color] of Object.entries(PROVIDER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-primary";
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ProviderTokensCard({ data, loading, title = "Tokens por Provedor", subtitle = "consumo total" }: Props) {
  const totalTokens = data.reduce((sum, p) => sum + p.total_tokens, 0) || 1;
  const cardRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    cardRef.current!.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    cardRef.current!.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <div ref={cardRef} onMouseMove={handleMouseMove} className="dash-card">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Server className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="space-y-3">
          {data.map((p) => {
            const pct = ((p.total_tokens / totalTokens) * 100).toFixed(1);
            return (
              <div key={p.provider} className="group">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${getProviderGradient(p.provider)} shrink-0`} />
                  <span className="text-xs font-semibold capitalize truncate flex-1" title={p.provider}>
                    {p.provider}
                  </span>
                  <span className="metric-value text-[11px] font-bold text-foreground shrink-0">
                    {formatTokens(p.total_tokens)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getProviderColor(p.provider)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
                  <span>↑ {formatTokens(p.prompt_tokens)}</span>
                  <span>↓ {formatTokens(p.completion_tokens)}</span>
                  <span>· {p.total_requests} req</span>
                  <span className="ml-auto">{pct}%</span>
                </div>
              </div>
            );
          })}
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="metric-value text-xs font-bold text-foreground">{formatTokens(totalTokens === 1 ? 0 : totalTokens)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
