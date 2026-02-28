import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

const statusConfig: Record<string, { label: string; dotColor: string; badgeBg: string }> = {
  active: { label: "Ativo", dotColor: "bg-emerald-500", badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  inactive: { label: "Inativo", dotColor: "bg-amber-500", badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  suspended: { label: "Suspenso", dotColor: "bg-rose-500", badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

export function RecentDeployments({ tenants, loading }: RecentDeploymentsProps) {
  return (
    <Card className="rounded-2xl border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold">Tenants Recentes</h2>
          <p className="text-xs text-muted-foreground">Últimos tenants provisionados</p>
        </div>
        <span className="text-xs text-primary font-medium cursor-pointer hover:underline">
          Ver tudo ↗
        </span>
      </div>

      <div className="mt-5 space-y-3.5">
        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        )}
        {!loading && tenants.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum tenant cadastrado</p>
        )}
        {tenants.slice(0, 6).map((tenant) => {
          const cfg = statusConfig[tenant.status] ?? statusConfig.inactive;
          return (
            <div key={tenant.id} className="flex items-center gap-3">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${cfg.dotColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tenant.name}</p>
                <p className="text-xs text-muted-foreground">
                  <Badge variant="secondary" className="mr-1.5 text-[10px] px-1.5 py-0">
                    {cfg.label}
                  </Badge>
                  → {tenant.slug}
                </p>
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
    </Card>
  );
}
