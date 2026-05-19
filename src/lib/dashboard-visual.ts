import type { CSSProperties } from "react";

export type DashboardVisual = "default" | "cw";

export const CW_DONUT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--info))",
  "hsl(var(--muted-foreground))",
  "hsl(217 30% 50%)",
  "hsl(220 15% 40%)",
  "hsl(215 20% 55%)",
] as const;

export function chartTooltipStyle(_visual?: DashboardVisual): CSSProperties {
  return {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
    color: "hsl(var(--foreground))",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  };
}

export function chartAxisTickClass(_visual?: DashboardVisual): string {
  return "text-[11px] fill-muted-foreground";
}

export function chartGridClass(_visual?: DashboardVisual): string {
  return "stroke-border";
}

export function subtitleClass(_visual?: DashboardVisual): string {
  return "text-xs text-muted-foreground";
}

export function emptyStateClass(_visual?: DashboardVisual): string {
  return "flex items-center justify-center text-sm text-muted-foreground";
}

export function inlineLinkClass(_visual?: DashboardVisual): string {
  return "text-xs text-primary font-medium hover:underline";
}

export function mutedSmallClass(_visual?: DashboardVisual): string {
  return "text-xs text-muted-foreground";
}

export function iconBadgeBox(_visual?: DashboardVisual, variant: "brand" | "muted" | "accent" | "success" | "info" = "brand"): string {
  const map = {
    brand: "rounded-md bg-muted",
    muted: "rounded-md bg-muted",
    accent: "rounded-md bg-muted",
    success: "rounded-md bg-muted",
    info: "rounded-md bg-muted",
  } as const;
  return `flex h-8 w-8 items-center justify-center ${map[variant]}`;
}

export function iconBadgeIcon(_visual?: DashboardVisual, _variant?: string): string {
  return "h-4 w-4 text-muted-foreground";
}

export function cwSeriesColor(idx: number): string {
  return CW_DONUT_COLORS[idx % CW_DONUT_COLORS.length];
}
