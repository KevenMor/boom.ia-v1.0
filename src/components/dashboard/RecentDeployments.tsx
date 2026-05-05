import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { type DashboardVisual, inlineLinkClass, subtitleClass } from "@/lib/dashboard-visual";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at?: string;
}

interface RecentDeploymentsProps {
  tenants: Tenant[];
  loading?: boolean;
  visual?: DashboardVisual;
}

const statusConfig: Record<string, { label: string; dotColor: string }> = {
  active: { label: "Ativo", dotColor: "bg-success" },
  inactive: { label: "Inativo", dotColor: "bg-warning" },
  suspended: { label: "Suspenso", dotColor: "bg-destructive" },
};

export function RecentDeployments({ tenants, loading, visual = "default" }: RecentDeploymentsProps) {
  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              visual === "cw"
                ? "flex h-8 w-8 items-center justify-center rounded-lg border border-cw-weak bg-cw-alpha"
                : "flex h-8 w-8 items-center justify-center rounded-lg bg-info/10"
            }
          >
            <Building2 className={visual === "cw" ? "h-4 w-4 text-cw-brand" : "h-4 w-4 text-info"} />
          </span>
          <div>
            <span className="box-title">Tenants Recentes</span>
            <p className={subtitleClass(visual)}>Últimos provisionados</p>
          </div>
        </div>
        <a href="/tenants" className={inlineLinkClass(visual)}>
          Ver tudo ↗
        </a>
      </div>

      <div className="box-body">
        {loading && (
          <p className={visual === "cw" ? "py-6 text-center text-sm text-cw-slate-10" : "py-6 text-center text-sm text-muted-foreground"}>
            Carregando...
          </p>
        )}
        {!loading && tenants.length === 0 && (
          <p className={visual === "cw" ? "py-6 text-center text-sm text-cw-slate-10" : "py-6 text-center text-sm text-muted-foreground"}>
            Nenhum tenant cadastrado
          </p>
        )}
        <div className="space-y-3.5">
          {tenants.slice(0, 6).map((tenant) => {
            const cfg = statusConfig[tenant.status] ?? statusConfig.inactive;
            return (
              <div key={tenant.id} className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dotColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tenant.name}</p>
                  <div className={visual === "cw" ? "text-xs text-cw-slate-10" : "text-xs text-muted-foreground"}>
                    <Badge
                      variant="secondary"
                      className={
                        visual === "cw"
                          ? "mr-1.5 border border-cw-weak bg-cw-solid-2 px-1.5 py-0 text-[10px] text-cw-slate-11"
                          : "mr-1.5 text-[10px] px-1.5 py-0"
                      }
                    >
                      {cfg.label}
                    </Badge>
                    → {tenant.slug}
                  </div>
                </div>
                <span className={visual === "cw" ? "shrink-0 text-xs text-cw-slate-10" : "shrink-0 text-xs text-muted-foreground"}>
                  {tenant.created_at
                    ? new Date(tenant.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
