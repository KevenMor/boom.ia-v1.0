import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";

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
}

const statusConfig: Record<string, { label: string; dotColor: string }> = {
  active: { label: "Ativo", dotColor: "bg-success" },
  inactive: { label: "Inativo", dotColor: "bg-warning" },
  suspended: { label: "Suspenso", dotColor: "bg-destructive" },
};

export function RecentDeployments({ tenants, loading }: RecentDeploymentsProps) {
  return (
    <div className="box h-full">
      <div className="box-header justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
            <Building2 className="h-4 w-4 text-info" />
          </span>
          <div>
            <span className="box-title">Tenants Recentes</span>
            <p className="text-[11px] text-muted-foreground">Últimos provisionados</p>
          </div>
        </div>
        <a href="/tenants" className="text-xs text-primary font-medium hover:underline">
          Ver tudo ↗
        </a>
      </div>

      <div className="box-body">
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        )}
        {!loading && tenants.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum tenant cadastrado</p>
        )}
        <div className="space-y-3.5">
          {tenants.slice(0, 6).map((tenant) => {
            const cfg = statusConfig[tenant.status] ?? statusConfig.inactive;
            return (
              <div key={tenant.id} className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dotColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tenant.name}</p>
                  <div className="text-xs text-muted-foreground">
                    <Badge variant="secondary" className="mr-1.5 text-[10px] px-1.5 py-0">
                      {cfg.label}
                    </Badge>
                    → {tenant.slug}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
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
