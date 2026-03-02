import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Server } from "lucide-react";
import type { ProviderTokenSummary } from "@/hooks/useTokensByProvider";

interface Props {
  data: ProviderTokenSummary[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-emerald-500",
  google: "bg-blue-500",
  anthropic: "bg-amber-500",
  lovable: "bg-violet-500",
};

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

  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
        </div>
      ) : data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="space-y-4">
          {data.map((p) => {
            const pct = ((p.total_tokens / totalTokens) * 100).toFixed(1);
            return (
              <div key={p.provider}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold capitalize truncate max-w-[50%]" title={p.provider}>
                    {p.provider}
                  </span>
                  <span className="text-[11px] text-muted-foreground text-right">
                    {formatTokens(p.total_tokens)} tokens · {p.total_requests} req
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getProviderColor(p.provider)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span>Prompt: {formatTokens(p.prompt_tokens)}</span>
                  <span>Completion: {formatTokens(p.completion_tokens)}</span>
                  <span>{pct}%</span>
                </div>
              </div>
            );
          })}
          {/* Total */}
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-xs font-semibold">Total</span>
            <span className="text-xs font-bold text-foreground">{formatTokens(totalTokens === 1 ? 0 : totalTokens)} tokens</span>
          </div>
        </div>
      )}
    </Card>
  );
}
