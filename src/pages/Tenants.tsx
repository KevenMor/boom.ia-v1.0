import { useState } from "react";
import { Building2, Plus, Search, MoreHorizontal, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenants } from "@/hooks/useTenants";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateTenantDialog } from "@/components/tenants/CreateTenantDialog";
import { EditTenantDialog } from "@/components/tenants/EditTenantDialog";
import { DeleteTenantDialog } from "@/components/tenants/DeleteTenantDialog";
import type { Tenant } from "@/types/database";

export default function Tenants() {
  const [search, setSearch] = useState("");
  const { data: tenants, isLoading, error } = useTenants();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);

  const filtered = (tenants ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Empresas</h2>
          <p className="text-sm text-muted-foreground">{tenants?.length ?? 0} tenants registrados</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Tenant
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 bg-background pl-9"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar tenants: {error.message}</p>
      )}

      <Card className="border-border bg-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left">Empresa</th>
                <th className="px-5 py-3 text-left">Slug</th>
                <th className="px-5 py-3 text-center">Plano</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3" colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhum tenant encontrado
                  </td>
                </tr>
              )}
              {filtered.map((tenant, i) => (
                <tr
                  key={tenant.id}
                  className="transition-colors hover:bg-muted/30 animate-fade-in cursor-pointer"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs text-muted-foreground">{tenant.slug}</code>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant="secondary" className="text-xs capitalize">{tenant.plan}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge
                      className={
                        tenant.status === "active"
                          ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                          : tenant.status === "suspended"
                          ? "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                          : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                      }
                    >
                      {tenant.status === "active" ? "Ativo" : tenant.status === "suspended" ? "Suspenso" : "Provisionando"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTenant(tenant)}>
                          <Pencil className="mr-2 h-3 w-3" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTenant(tenant)}
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditTenantDialog tenant={editTenant} open={!!editTenant} onOpenChange={(o) => !o && setEditTenant(null)} />
      <DeleteTenantDialog tenant={deleteTenant} open={!!deleteTenant} onOpenChange={(o) => !o && setDeleteTenant(null)} />
    </div>
  );
}
