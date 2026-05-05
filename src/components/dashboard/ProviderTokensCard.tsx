import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Server } from "lucide-react";
import type { ProviderTokenSummary } from "@/hooks/useTokensByProvider";
import { type DashboardVisual, CW_DONUT_COLORS } from "@/lib/dashboard-visual";

interface Props {
  data: ProviderTokenSummary[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  visual?: DashboardVisual;
  /** Cartão Stitch: vidro + barras violeta/teal + CTA configurar limites. */
  premiumStitch?: boolean;
}

const PROVIDER_COLORS = ["#7c3aed", "#0d9488", "#a855f7", "#cbd5e1"];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function ProviderTokensCard({
  data,
  loading,
  title = "Tokens por Provedor",
  subtitle = "consumo total",
  visual = "default",
  premiumStitch,
}: Props) {
  const totalTokens = data.reduce((sum, p) => sum + p.total_tokens, 0) || 1;
  const paletteLegacy = premiumStitch
    ? PROVIDER_COLORS
    : visual === "cw"
      ? [...CW_DONUT_COLORS]
      : [
          "hsl(var(--primary))",
          "hsl(var(--primary-tint1))",
          "hsl(var(--primary-tint2))",
          "hsl(var(--primary-tint3))",
          "hsl(var(--secondary))",
          "hsl(var(--info))",
        ];

  const stitch = premiumStitch && visual === "default";

  const rows = stitch ? (
    loading ? (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    ) : data.length === 0 ? (
      <div className="py-10 text-center text-sm text-[#64748b] dark:text-muted-foreground">Sem dados</div>
    ) : (
      <div className="space-y-5">
        {data.map((p, idx) => {
          const pct = Math.round((p.total_tokens / totalTokens) * 100);
          const color = PROVIDER_COLORS[idx % PROVIDER_COLORS.length];
          return (
            <div key={p.provider} className="group">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#0f172a] transition-colors hover:text-[#7c3aed] dark:text-foreground">{p.provider}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">{pct}% dos tokens</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
        <Button
          variant="outline"
          type="button"
          className="mt-6 w-full rounded-xl border-[#ede9fe] bg-white py-2.5 text-[14px] font-semibold text-[#7c3aed] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#7c3aed]/5 dark:border-border dark:bg-card"
          asChild
        >
          <Link to="/providers">Gerenciar Limites</Link>
        </Button>
      </div>
    )
  ) : loading ? (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  ) : data.length === 0 ? (
    <div className={visual === "cw" ? "py-10 text-center text-sm text-cw-slate-10" : "py-10 text-center text-sm text-muted-foreground"}>Sem dados</div>
  ) : (
    <div className="space-y-4">
      {data.map((p, idx) => {
        const pct = Math.round((p.total_tokens / totalTokens) * 100);
        const color = paletteLegacy[idx % paletteLegacy.length];
        return (
          <div key={p.provider}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium capitalize">{p.provider}</span>
              <span className="metric-value text-sm font-semibold">{formatTokens(p.total_tokens)}</span>
            </div>
            <div className={visual === "cw" ? "h-2 w-full overflow-hidden rounded-full bg-cw-solid-2" : "h-2 w-full overflow-hidden rounded-full bg-muted"}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <div className={visual === "cw" ? "mt-1.5 flex gap-2 text-[11px] text-cw-slate-10" : "mt-1.5 flex gap-2 text-[11px] text-muted-foreground"}>
              <span>↑ {formatTokens(p.prompt_tokens)} in</span>
              <span>↓ {formatTokens(p.completion_tokens)} out</span>
              <span>· {p.total_requests} req</span>
              <span className={visual === "cw" ? "ml-auto font-medium text-emerald-600 dark:text-emerald-400" : "ml-auto font-medium text-success"}>{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (stitch) {
    return (
      <div className="glass-card flex shrink-0 flex-col rounded-xl border border-slate-200/60 bg-white p-6 shadow-soft transition-colors hover:border-[#7c3aed]/20 hover:shadow-md dark:border-border dark:bg-card/40">
        <h3 className="mb-5 text-[1.125rem] font-semibold tracking-tight text-[#0f172a] dark:text-foreground">{title}</h3>
        {rows}
      </div>
    );
  }

  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"
            }
          >
            <Server className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-primary"} />
          </span>
          <div>
            <span className="box-title">{title}</span>
            <p className={visual === "cw" ? "text-[11px] text-cw-slate-10" : "text-[11px] text-muted-foreground"}>{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="box-body">{rows}</div>
    </div>
  );
}
