import { Skeleton } from "@/components/ui/skeleton";
import { Server } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ProviderTokenSummary } from "@/hooks/useTokensByProvider";

interface Props {
  data: ProviderTokenSummary[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

const PROVIDER_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary-tint1))",
  "hsl(var(--primary-tint2))",
  "hsl(var(--primary-tint3))",
  "hsl(var(--secondary))",
  "hsl(var(--info))",
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ProviderTokensCard({ data, loading, title = "Tokens por Provedor", subtitle = "consumo total" }: Props) {
  const totalTokens = data.reduce((sum, p) => sum + p.total_tokens, 0) || 1;

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </span>
          <div>
            <span className="box-title">{title}</span>
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="box-body">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Sem dados</div>
        ) : (
          <div className="space-y-4">
            {data.map((p, idx) => {
              const pct = Math.round((p.total_tokens / totalTokens) * 100);
              const color = PROVIDER_COLORS[idx % PROVIDER_COLORS.length];
              return (
                <div key={p.provider}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium capitalize">{p.provider}</span>
                    <span className="metric-value text-sm font-semibold">{formatTokens(p.total_tokens)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="flex gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    <span>↑ {formatTokens(p.prompt_tokens)} in</span>
                    <span>↓ {formatTokens(p.completion_tokens)} out</span>
                    <span>· {p.total_requests} req</span>
                    <span className="ml-auto font-medium text-success">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
