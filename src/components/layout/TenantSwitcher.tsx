import { useEffect } from "react";
import { Check } from "lucide-react";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ms } from "@/components/ui/material-symbol";

export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { data: tenants, isLoading, isError, error } = useTenants();
  const { isSuperAdmin } = useAuth();
  const { selectedTenantId, setSelectedTenantId, selectedTenant, setSelectedTenant, scopedTenantDisplayName } =
    useTenantContext();

  useEffect(() => {
    if (!tenants || isLoading) return;
    if (selectedTenantId) {
      const found = tenants.find((t) => t.id === selectedTenantId);
      if (found) {
        setSelectedTenant(found);
      } else if (tenants.length === 0) {
        return;
      } else if (isSuperAdmin) {
        setSelectedTenantId(null);
        setSelectedTenant(null);
      } else {
        const first = tenants.find((t) => t.status === "active") ?? tenants[0];
        if (first) setSelectedTenantId(first.id);
        setSelectedTenant(null);
      }
    } else {
      setSelectedTenant(null);
    }
  }, [tenants, selectedTenantId, isSuperAdmin, setSelectedTenantId, setSelectedTenant, isLoading]);

  const visibleTenants = tenants ?? [];
  const nameForSelectedId =
    selectedTenantId && tenants?.length ? tenants.find((t) => t.id === selectedTenantId)?.name : undefined;
  const displayName = isSuperAdmin
    ? selectedTenant?.name ?? nameForSelectedId ?? (!selectedTenantId ? "Todos os tenants" : "—")
    : selectedTenant?.name ??
      nameForSelectedId ??
      scopedTenantDisplayName ??
      (isLoading ? "Carregando..." : visibleTenants[0]?.name ?? "Empresa");
  const workspaceSubtitle = isSuperAdmin ? "Workspace Admin" : "Conta";

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed] text-white shadow-sm transition-opacity hover:opacity-90"
            title={displayName}
            type="button"
          >
            <Ms name="apartment" className="!text-[18px] text-white" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isSuperAdmin && (
            <>
              <DropdownMenuItem onClick={() => setSelectedTenantId(null)} className="gap-2 py-2">
                <span className="flex-1 truncate font-medium">Todos os tenants</span>
                {!selectedTenantId && <Check className="h-4 w-4 text-primary shrink-0" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isError && isSuperAdmin && (
            <DropdownMenuItem disabled className="whitespace-normal text-xs text-destructive py-2">
              /admin/tenants: {error?.message ?? "erro"}. Confere server/.env → NEXUS_SERVICE_ROLE_KEY.
            </DropdownMenuItem>
          )}
          {visibleTenants.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => setSelectedTenantId(t.id)} className="gap-2 py-2">
              <span className="flex-1 truncate">{t.name}</span>
              {selectedTenantId === t.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-[#7c3aed]/30 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-[#7c3aed]/40"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed] text-white">
              <Ms name="apartment" className="!text-[18px]" />
            </div>
            <div className="flex min-w-0 flex-col text-start leading-tight">
              <span className="truncate text-sm font-bold text-[#0f172a] dark:text-slate-100">{displayName}</span>
              <span className="truncate text-[11px] font-medium text-[#64748b] dark:text-slate-400">
                {workspaceSubtitle}
              </span>
            </div>
          </div>
          <Ms name="unfold_more" className="shrink-0 !text-[20px] text-[#64748b] dark:text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[228px] max-w-[280px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin && (
          <>
            <DropdownMenuItem onClick={() => setSelectedTenantId(null)} className="gap-2 py-2">
              <span className="flex-1 truncate text-sm font-medium">Todos os tenants</span>
              {!selectedTenantId && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isLoading && (
          <DropdownMenuItem disabled className="py-2 text-xs text-muted-foreground">
            Carregando...
          </DropdownMenuItem>
        )}
        {isError && isSuperAdmin && (
          <DropdownMenuItem disabled className="whitespace-normal py-2 text-xs text-destructive">
            API /admin/tenants falhou ({error?.message ?? "erro"}). Em local, confere{" "}
            <span className="font-mono">server/.env</span>: <span className="font-mono">NEXUS_SERVICE_ROLE_KEY</span>{" "}
            (service_role do mesmo projeto que a URL Supabase).
          </DropdownMenuItem>
        )}
        {visibleTenants.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => setSelectedTenantId(t.id)} className="gap-2 py-2">
            <span className="flex-1 truncate text-sm">{t.name}</span>
            {selectedTenantId === t.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
