import React from "react";
import { Link } from "react-router-dom";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { SectionHeader } from "@/components/dashboard/v2/SectionHeader";
import { QuickActionsRow } from "@/components/dashboard/v2/QuickActionsRow";
import { RecentDeployments } from "@/components/dashboard/RecentDeployments";

function todayLabelBrasilia(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * Painel mínimo: só atalhos + lista de empresas.
 * Sem agentes/providers/tokens — evita saturar o pool do Supabase na entrada.
 */
const Dashboard = React.forwardRef<HTMLDivElement>(function Dashboard(_props, ref) {
  const { selectedTenantId } = useTenantContext();
  const { data: tenants, isLoading: loadingTenantsRaw, isError, error, refetch, isFetching } = useTenants();
  const loadingTenants = loadingTenantsRaw && !tenants;
  const activeTenants = tenants?.filter((t) => t.status === "active").length ?? 0;
  const dateLabel = todayLabelBrasilia();

  return (
    <div
      ref={ref}
      className="ds-typeui font-plex -m-6 min-h-[calc(100dvh-4rem)] space-y-7 p-6 md:-m-8 md:space-y-8 md:p-8"
    >
      <header className="border-b border-border/70 pb-5">
        <p className="tu-label mb-1">{dateLabel}</p>
        <h1 className="text-[1.5rem] font-medium tracking-[-0.02em] text-foreground sm:text-[1.75rem]">
          Centro de operação
        </h1>
        <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
          Painel leve. Métricas pesadas ficam em{" "}
          <Link to="/analytics/tokens" className="underline underline-offset-2 hover:text-foreground">
            Analytics
          </Link>
          .
        </p>
      </header>

      <section>
        <SectionHeader
          eyebrow="Atalhos"
          title="Ir para a operação"
          description="Fila, chat e agentes."
        />
        <QuickActionsRow />
      </section>

      <section>
        <SectionHeader
          eyebrow="Workspace"
          title="Empresas"
          description={
            loadingTenants || isFetching
              ? "Carregando empresas…"
              : isError
                ? "Falha ao carregar — o banco pode estar saturado."
                : `${activeTenants} ativa(s) · ${tenants?.length ?? 0} no total`
          }
        />
        {isError && (
          <div className="tu-panel mb-4 space-y-2 px-4 py-3 text-sm">
            <p className="text-destructive">
              {error instanceof Error ? error.message : "Erro ao listar empresas."}
            </p>
            <button
              type="button"
              className="text-xs underline underline-offset-2 hover:text-foreground"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </button>
          </div>
        )}
        <div className="tu-panel max-w-2xl overflow-hidden [&_>div]:border-0 [&_>div]:bg-transparent [&_>div]:shadow-none">
          <RecentDeployments tenants={tenants ?? []} loading={loadingTenants} />
        </div>
        {selectedTenantId && (
          <p className="mt-2 text-xs text-muted-foreground">
            Escopo atual filtrado por uma empresa. Use o seletor na sidebar para ver todas.
          </p>
        )}
      </section>
    </div>
  );
});

export default Dashboard;
