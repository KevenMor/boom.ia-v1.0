import { useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function TenantSwitcher({ collapsed = false, onDropdownOpenChange }: { collapsed?: boolean; onDropdownOpenChange?: (open: boolean) => void }) {
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

  const visibleTenants = (tenants ?? []).filter((t) => t.status !== "suspended");
  const nameForSelectedId =
    selectedTenantId && tenants?.length ? tenants.find((t) => t.id === selectedTenantId)?.name : undefined;
  const displayName = isSuperAdmin
    ? selectedTenant?.name ?? nameForSelectedId ?? (!selectedTenantId ? "Todos os tenants" : "—")
    : selectedTenant?.name ??
      nameForSelectedId ??
      scopedTenantDisplayName ??
      (isLoading ? "Carregando..." : visibleTenants[0]?.name ?? "Empresa");

  const initial = displayName.slice(0, 1).toUpperCase();

  if (collapsed) {
    return (
      <DropdownMenu onOpenChange={onDropdownOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-[11px] font-semibold text-sidebar-accent-foreground transition-colors duration-150 hover:bg-sidebar-accent"
            title={displayName}
            type="button"
          >
            {initial}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isSuperAdmin && (
            <>
              <DropdownMenuItem onClick={() => setSelectedTenantId(null)} className="gap-2 py-2">
                <span className="flex-1 truncate font-medium">Todos os tenants</span>
                {!selectedTenantId && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isError && (
            <DropdownMenuItem disabled className="whitespace-normal py-2 text-xs text-destructive">
              Empresas: {error?.message ?? "erro ao carregar"}
            </DropdownMenuItem>
          )}
          {visibleTenants.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => setSelectedTenantId(t.id)} className="gap-2 py-2">
              <span className="flex-1 truncate">{t.name}</span>
              {selectedTenantId === t.id && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu onOpenChange={onDropdownOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-left",
            "transition-colors duration-150 hover:bg-sidebar-accent",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-accent-foreground">
            {displayName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px] max-w-[260px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isSuperAdmin && (
          <>
            <DropdownMenuItem onClick={() => setSelectedTenantId(null)} className="gap-2 py-2">
              <span className="flex-1 truncate text-sm font-medium">Todos os tenants</span>
              {!selectedTenantId && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isLoading && (
          <DropdownMenuItem disabled className="py-2 text-xs text-muted-foreground">
            Carregando...
          </DropdownMenuItem>
        )}
        {isError && (
          <DropdownMenuItem disabled className="whitespace-normal py-2 text-xs text-destructive">
            Empresas: {error?.message ?? "erro ao carregar"}
          </DropdownMenuItem>
        )}
        {visibleTenants.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => setSelectedTenantId(t.id)} className="gap-2 py-2">
            <span className="flex-1 truncate text-sm">{t.name}</span>
            {selectedTenantId === t.id && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
