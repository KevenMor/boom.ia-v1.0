import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid,
  Plus,
  Search,
  Pencil,
  Users,
  Package,
  ConciergeBell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalogItemsList,
  usePatchCatalogItemStatus,
  type CatalogItemListRow,
  type CatalogListSort,
} from "@/hooks/useServiceCatalog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatPrice(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    active: {
      label: "Ativo",
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    },
    inactive: {
      label: "Inativo",
      className: "bg-muted text-muted-foreground border-border",
    },
    coming_soon: {
      label: "Em breve",
      className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
    },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("font-medium", s.className)}>
      {s.label}
    </Badge>
  );
}

export default function ServiceCatalogPage() {
  const { selectedTenantId } = useTenantContext();
  const { isSuperAdmin, isTenantAdmin } = useAuth();
  const canManage = isSuperAdmin || isTenantAdmin(selectedTenantId);
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<"all" | "service" | "product">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "coming_soon">("all");
  const [sort, setSort] = useState<CatalogListSort>("name_asc");

  const { data: items, isLoading, error } = useCatalogItemsList({
    tenantId: selectedTenantId,
    search,
    itemType,
    status: statusFilter,
    sort,
  });

  const patchStatus = usePatchCatalogItemStatus();

  const onToggleActive = async (row: CatalogItemListRow, nextActive: boolean) => {
    const next = nextActive ? "active" : "inactive";
    try {
      await patchStatus.mutateAsync({ id: row.id, status: next });
      toast.success(nextActive ? "Item ativado" : "Item desativado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o status");
    }
  };

  if (!selectedTenantId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Selecione um tenant para ver o catálogo de serviços e produtos.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Painel</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Catálogo</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Catálogo inteligente</h1>
            <p className="text-sm text-muted-foreground">
              Serviços e produtos alimentam atendimento, agenda e RAG.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link to="/catalog/professionals">
              <Users className="h-4 w-4" />
              Profissionais
            </Link>
          </Button>
          {canManage && (
            <Button size="sm" className="gap-2" asChild>
              <Link to="/catalog/items/new">
                <Plus className="h-4 w-4" />
                Novo item
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={itemType} onValueChange={(v) => setItemType(v as typeof itemType)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="service">Serviço</SelectItem>
            <SelectItem value="product">Produto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
            <SelectItem value="coming_soon">Em breve</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as CatalogListSort)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Nome A–Z</SelectItem>
            <SelectItem value="name_desc">Nome Z–A</SelectItem>
            <SelectItem value="price_asc">Menor preço</SelectItem>
            <SelectItem value="price_desc">Maior preço</SelectItem>
            <SelectItem value="category">Categoria</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Erro ao carregar o catálogo"}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : !items?.length ? (
        <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center text-sm text-muted-foreground">
          Nenhum item encontrado. {canManage && "Crie o primeiro com “Novo item”."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((row) => (
            <Card key={row.id} className="flex flex-col overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.item_type === "product" ? (
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ConciergeBell className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium leading-tight truncate">{row.name}</span>
                  </div>
                  {statusBadge(row.status)}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {row.catalog_categories?.name ?? "Sem categoria"}
                </p>
              </CardHeader>
              <CardContent className="flex-1 pb-2">
                <p className="text-lg font-semibold text-primary">{formatPrice(row.price_standard)}</p>
                {row.price_promo != null && (
                  <p className="text-xs text-muted-foreground">
                    Promo: {formatPrice(row.price_promo)}
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between border-t bg-muted/20 pt-3">
                {canManage ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.status === "active"}
                        disabled={patchStatus.isPending}
                        onCheckedChange={(c) => onToggleActive(row, c)}
                        aria-label={row.status === "active" ? "Desativar" : "Ativar"}
                      />
                      <span className="text-xs text-muted-foreground">Ativo</span>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1" asChild>
                      <Link to={`/catalog/items/${row.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Link>
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to={`/catalog/items/${row.id}`}>Ver detalhes</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
