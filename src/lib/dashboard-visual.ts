import type { CSSProperties } from "react";

/** Painel clássico (teal shadcn) vs painel Chatwoot (tokens `cw-*` dentro de `.ds-chatwoot`). */
export type DashboardVisual = "default" | "cw";

export const CW_DONUT_COLORS = [
  "var(--cw-series-1)",
  "var(--cw-series-2)",
  "var(--cw-series-3)",
  "var(--cw-series-4)",
  "var(--cw-series-5)",
  "var(--cw-series-6)",
] as const;

export function chartTooltipStyle(visual: DashboardVisual): CSSProperties {
  if (visual === "cw") {
    return {
      backgroundColor: "var(--cw-elevated)",
      border: "1px solid var(--cw-weak)",
      borderRadius: "8px",
      fontSize: "12px",
      color: "var(--cw-slate-12)",
    };
  }
  return {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--popover-foreground))",
  };
}

export function chartAxisTickClass(visual: DashboardVisual): string {
  return visual === "cw" ? "text-[11px] fill-cw-slate-10" : "text-[11px] fill-muted-foreground";
}

export function chartGridClass(visual: DashboardVisual): string {
  return visual === "cw" ? "stroke-cw-weak" : "stroke-border";
}

export function subtitleClass(visual: DashboardVisual): string {
  return visual === "cw" ? "text-[11px] text-cw-slate-10" : "text-[11px] text-muted-foreground";
}

export function emptyStateClass(visual: DashboardVisual): string {
  return visual === "cw"
    ? "flex items-center justify-center text-sm text-cw-slate-10"
    : "flex items-center justify-center text-sm text-muted-foreground";
}

export function inlineLinkClass(visual: DashboardVisual): string {
  return visual === "cw"
    ? "text-xs font-medium text-cw-brand hover:underline"
    : "text-xs text-primary font-medium hover:underline";
}

export function mutedSmallClass(visual: DashboardVisual): string {
  return visual === "cw" ? "text-xs text-cw-slate-10" : "text-xs text-muted-foreground";
}

export function iconBadgeBox(visual: DashboardVisual, variant: "brand" | "muted" | "accent" | "success" | "info"): string {
  if (visual !== "cw") {
    const map = {
      brand: "rounded-lg bg-primary/10",
      muted: "rounded-lg bg-secondary/10",
      accent: "rounded-lg bg-warning/10",
      success: "rounded-lg bg-success/10",
      info: "rounded-lg bg-info/10",
    } as const;
    return `flex h-8 w-8 items-center justify-center ${map[variant]}`;
  }
  const mapCw = {
    brand: "rounded-lg border border-cw-weak bg-cw-alpha",
    muted: "rounded-lg border border-cw-weak bg-cw-solid-2",
    accent: "rounded-lg border border-cw-weak bg-cw-alpha",
    success: "rounded-lg border border-emerald-500/25 bg-emerald-500/10",
    info: "rounded-lg border border-cw-weak bg-cw-alpha",
  } as const;
  return `flex h-8 w-8 items-center justify-center ${mapCw[variant]}`;
}

export function iconBadgeIcon(visual: DashboardVisual, variant: "brand" | "muted" | "accent" | "success" | "info"): string {
  if (visual !== "cw") {
    const map = {
      brand: "h-4 w-4 text-primary",
      muted: "h-4 w-4 text-secondary",
      accent: "h-4 w-4 text-warning",
      success: "h-4 w-4 text-success",
      info: "h-4 w-4 text-info",
    } as const;
    return `h-4 w-4 ${map[variant]}`;
  }
  const mapCw = {
    brand: "h-4 w-4 text-cw-brand",
    muted: "h-4 w-4 text-cw-slate-11",
    accent: "h-4 w-4 text-cw-slate-11",
    success: "h-4 w-4 text-emerald-600 dark:text-emerald-400",
    info: "h-4 w-4 text-cw-brand",
  } as const;
  return `h-4 w-4 ${mapCw[variant]}`;
}

/** Cor de série para barras / avatares (índice modular). */
export function cwSeriesColor(idx: number): string {
  return CW_DONUT_COLORS[idx % CW_DONUT_COLORS.length];
}
