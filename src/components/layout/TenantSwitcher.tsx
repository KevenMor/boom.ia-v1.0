import { useEffect } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
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

export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { data: tenants, isLoading } = useTenants();
  const { isSuperAdmin } = useAuth();
  const { selectedTenantId, setSelectedTenantId, selectedTenant, setSelectedTenant } = useTenantContext();

  // Sync full tenant object when tenants load or selection changes
  useEffect(() => {
    if (!tenants) return;
    if (selectedTenantId) {
      const found = tenants.find((t) => t.id === selectedTenantId);
      if (found) {
        setSelectedTenant(found);
      } else {
        // Invalid stored ID, reset
        setSelectedTenantId(null);
        setSelectedTenant(null);
      }
    } else {
      setSelectedTenant(null);
    }
  }, [tenants, selectedTenantId]);

  const visibleTenants = isSuperAdmin
    ? (tenants ?? [])
    : (tenants?.filter((t) => t.status === "active") ?? []);
  const displayName = selectedTenant?.name ?? "Todos os tenants";
  const initials = selectedTenant?.name?.slice(0, 2).toUpperCase() ?? "ALL";

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex w-full items-center justify-center rounded-xl p-2 transition-colors hover:bg-white/10"
            title={displayName}
          >
            <Building2 className="h-5 w-5 text-primary" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setSelectedTenantId(null)}
            className="gap-2 py-2"
          >
            <span className="flex-1 truncate font-medium">Todos os tenants</span>
            {!selectedTenantId && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {visibleTenants.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setSelectedTenantId(t.id)}
              className="gap-2 py-2"
            >
              <span className="flex-1 truncate">{t.name}</span>
              {selectedTenantId === t.id && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/10">
          <div className="flex flex-1 flex-col min-w-0 text-start">
            <span className="text-sm font-semibold text-white truncate">{displayName}</span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/30" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-[228px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Alterar conta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setSelectedTenantId(null)}
          className="gap-2 py-2"
        >
          <span className="flex-1 truncate text-sm font-medium">Todos os tenants</span>
          {!selectedTenantId && <Check className="h-4 w-4 text-primary shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isLoading && (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground py-2">Carregando...</DropdownMenuItem>
        )}
        {visibleTenants.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => setSelectedTenantId(t.id)}
            className="gap-2 py-2"
          >
            <span className="flex-1 truncate text-sm">{t.name}</span>
            {selectedTenantId === t.id && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
