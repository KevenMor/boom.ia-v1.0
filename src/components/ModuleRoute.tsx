import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useFirstEnabledRoute } from "@/hooks/useFirstEnabledRoute";
import type { Profile } from "@/types/database";

interface ModuleRouteProps {
  moduleKey: string;
  children: ReactNode;
  requiredRoles?: Profile["role"][];
}

export function ModuleRoute({ moduleKey, children, requiredRoles }: ModuleRouteProps) {
  const { isModuleEnabled, tenantModulesLoading, selectedTenantModules } = useTenantContext();
  const { profile, isSuperAdmin } = useAuth();
  const firstRoute = useFirstEnabledRoute();

  if (requiredRoles && requiredRoles.length > 0 && !isSuperAdmin) {
    const role = profile?.role;
    if (!role || !requiredRoles.includes(role)) {
      return (
        <div className="mx-auto max-w-xl rounded-lg border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold">Acesso não permitido</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu perfil não possui permissão para acessar esta tela.
          </p>
          <Button asChild className="mt-4">
            <Link to={firstRoute}>Voltar ao painel</Link>
          </Button>
        </div>
      );
    }
  }

  /** Spinner só na primeira carga; com cache de permissões mantém a rota montada. */
  if (tenantModulesLoading && !selectedTenantModules) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Atualizando permissões do workspace…</p>
        </div>
      </div>
    );
  }

  if (isSuperAdmin || isModuleEnabled(moduleKey)) {
    return <>{children}</>;
  }

  // Módulo desabilitado — redireciona para a primeira rota acessível
  return <Navigate to={firstRoute} replace />;
}
