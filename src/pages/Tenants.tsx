import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTenants } from "@/hooks/useTenants";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateTenantDialog } from "@/components/tenants/CreateTenantDialog";
import { EditTenantDialog } from "@/components/tenants/EditTenantDialog";
import { DeleteTenantDialog } from "@/components/tenants/DeleteTenantDialog";
import type { Tenant } from "@/types/database";

export default function Tenants() {
  const navigate = useNavigate();
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-x-3">
          <h2 className="text-lg font-medium text-foreground">Empresas</h2>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            {tenants?.length ?? 0} tenants
          </span>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Tenant
        </Button>
      </div>

      {/* Search */}
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

      {/* Table */}
      <div className="flex flex-col">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Empresa
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Plano
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Slug
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Database
                    </th>
                    <th className="relative px-4 py-3.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {isLoading &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-4" colSpan={6}>
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ))}

                  {!isLoading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum tenant encontrado
                      </td>
                    </tr>
                  )}

                  {filtered.map((tenant, i) => (
                    <tr
                      key={tenant.id}
                      className="transition-colors hover:bg-muted/30 animate-fade-in cursor-pointer"
                      style={{ animationDelay: `${i * 40}ms` }}
                      onClick={() => navigate(`/tenants/${tenant.id}/edit`)}
                    >
                      {/* Name */}
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        <div className="flex items-center gap-x-3">
                          {(tenant.settings as any)?.logo_url ? (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/50 overflow-hidden">
                              <img src={(tenant.settings as any).logo_url} alt={tenant.name} className="h-full w-full object-cover" />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div>
                            <h2 className="font-medium text-foreground">{tenant.name}</h2>
                            <p className="text-xs text-muted-foreground">
                              Criado em {new Date(tenant.created_at).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        <div className="inline-flex items-center gap-x-2 rounded-full bg-muted px-3 py-1">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              tenant.status === "active"
                                ? "bg-success"
                                : tenant.status === "suspended"
                                ? "bg-destructive"
                                : "bg-warning"
                            }`}
                          />
                          <span
                            className={`text-sm font-normal ${
                              tenant.status === "active"
                                ? "text-success"
                                : tenant.status === "suspended"
                                ? "text-destructive"
                                : "text-warning"
                            }`}
                          >
                            {tenant.status === "active"
                              ? "Ativo"
                              : tenant.status === "suspended"
                              ? "Suspenso"
                              : "Provisionando"}
                          </span>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground capitalize">
                        {tenant.plan}
                      </td>

                      {/* Slug */}
                      <td className="whitespace-nowrap px-4 py-4">
                        <code className="font-mono text-xs text-muted-foreground">{tenant.slug}</code>
                      </td>

                      {/* Database */}
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        {tenant.db_host ? (
                          <div className="flex items-center gap-x-2">
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {tenant.db_host}:{tenant.db_port}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        <div className="flex items-center gap-x-4">
                          <button
                            onClick={() => setDeleteTenant(tenant)}
                            className="text-muted-foreground transition-colors duration-200 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/tenants/${tenant.id}/edit`)}
                            className="text-muted-foreground transition-colors duration-200 hover:text-warning"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditTenantDialog tenant={editTenant} open={!!editTenant} onOpenChange={(o) => !o && setEditTenant(null)} />
      <DeleteTenantDialog tenant={deleteTenant} open={!!deleteTenant} onOpenChange={(o) => !o && setDeleteTenant(null)} />
    </div>
  );
}
