import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AsaasConfigTab } from "@/components/tenants/AsaasConfigTab";
import { useTenants } from "@/hooks/useTenants";
import { Skeleton } from "@/components/ui/skeleton";

export default function TenantPaymentsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { data: tenants, isLoading } = useTenants();
  const tenant = tenants?.find((t) => t.id === tenantId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/tenants")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/tenants" className="hover:text-foreground">Empresas</Link>
            <span>/</span>
            <Link to={`/tenants/${tenantId}/edit`} className="hover:text-foreground">{tenant.name}</Link>
            <span>/</span>
            <span>Pagamentos</span>
          </div>
          <h2 className="text-lg font-medium text-foreground mt-1">
            Pagamentos — {tenant.name}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/tenants/${tenantId}/edit`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Link>
          </Button>
        </div>
      </div>

      <AsaasConfigTab tenantId={tenantId!} />
    </div>
  );
}