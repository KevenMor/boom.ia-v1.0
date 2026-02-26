import { useState } from "react";
import { Building2, Plus, Search, MoreHorizontal, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockTenants = [
  { id: "1", name: "Clínica Saúde+", slug: "clinica-saude", agents: 3, messages: 12400, status: "active", plan: "Pro" },
  { id: "2", name: "Auto Peças JM", slug: "auto-pecas-jm", agents: 1, messages: 5200, status: "active", plan: "Starter" },
  { id: "3", name: "Imobiliária Lar Doce", slug: "imob-lar", agents: 2, messages: 3100, status: "active", plan: "Pro" },
  { id: "4", name: "Escola Saber", slug: "escola-saber", agents: 1, messages: 890, status: "provisioning", plan: "Starter" },
  { id: "5", name: "Restaurante Sabor", slug: "rest-sabor", agents: 2, messages: 7800, status: "active", plan: "Pro" },
];

export default function Tenants() {
  const [search, setSearch] = useState("");

  const filtered = mockTenants.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Empresas</h2>
          <p className="text-sm text-muted-foreground">{mockTenants.length} tenants registrados</p>
        </div>
        <Button className="gap-2">
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

      {/* Table */}
      <Card className="border-border bg-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left">Empresa</th>
                <th className="px-5 py-3 text-left">Slug</th>
                <th className="px-5 py-3 text-center">Agentes</th>
                <th className="px-5 py-3 text-right">Msgs/mês</th>
                <th className="px-5 py-3 text-center">Plano</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                  <td className="px-5 py-3 text-center font-mono text-sm">{tenant.agents}</td>
                  <td className="px-5 py-3 text-right font-mono text-sm tabular-nums">
                    {tenant.messages.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant="secondary" className="text-xs">{tenant.plan}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge
                      className={
                        tenant.status === "active"
                          ? "bg-success/10 text-success border-success/20 hover:bg-success/20"
                          : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20"
                      }
                    >
                      {tenant.status === "active" ? "Ativo" : "Provisionando"}
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
                        <DropdownMenuItem>
                          <ExternalLink className="mr-2 h-3 w-3" />
                          Abrir
                        </DropdownMenuItem>
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Suspender</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
