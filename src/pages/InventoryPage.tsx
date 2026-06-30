import { useState } from "react";
import { Car, Plus, Search, Pencil, Trash2, RefreshCw, Video, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInventory, useInventorySync } from "@/hooks/useInventory";
import { useTenantContext } from "@/contexts/TenantContext";
import { useEmbedInventoryOptional } from "@/contexts/EmbedInventoryContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateInventoryDialog } from "@/components/inventory/CreateInventoryDialog";
import { EditInventoryDialog } from "@/components/inventory/EditInventoryDialog";
import { DeleteInventoryDialog } from "@/components/inventory/DeleteInventoryDialog";
import type { InventoryItem } from "@/types/database";
import { toast } from "sonner";
import { decodeInventoryDisplayText } from "@/lib/decodeHtmlEntities";

export default function InventoryPage() {
  const embed = useEmbedInventoryOptional();
  const { selectedTenantId } = useTenantContext();
  const isEmbed = !!embed;
  const effectiveTenantId = embed?.tenantId ?? selectedTenantId ?? undefined;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);

  // Quando "Todos os tenants" está selecionado: mostra todo o inventário do banco.
  // Quando um tenant específico está selecionado: filtra por esse tenant.
  const tenantId = effectiveTenantId;
  const { data, isLoading, error, refetch } = useInventory({
    tenant_id: tenantId,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search.trim() || undefined,
  });

  const syncMutation = useInventorySync();
  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  const canSync = isEmbed ? !!effectiveTenantId : !!selectedTenantId;

  const handleSync = async () => {
    if (!canSync) return;
    try {
      const res = await syncMutation.mutateAsync(effectiveTenantId ?? undefined);
      if (res.success) {
        toast.success(`Sincronizado: ${res.synced ?? 0} veículo(s)`);
      } else {
        toast.error(res.error ?? "Erro no sync");
      }
    } catch (err: any) {
      toast.error("Erro no sync: " + (err.message ?? "erro desconhecido"));
    }
  };

  const colCount = isEmbed ? 9 : 10;

  const formatPrice = (p: number | null) =>
    p != null ? p.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  const getPhotoUrl = (item: InventoryItem) => {
    if (item.photo_url) return item.photo_url;
    const photos = item.photos;
    if (Array.isArray(photos) && photos.length > 0) return photos[0];
    if (typeof photos === "string") {
      try {
        const arr = JSON.parse(photos) as string[];
        return arr[0] ?? null;
      } catch {
        return null;
      }
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-x-3">
          <h2 className="text-lg font-medium text-foreground">Inventário</h2>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            {total} veículo(s)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSync}
            disabled={syncMutation.isPending || !canSync}
            title={!canSync ? "Selecione um tenant para sincronizar" : undefined}
          >
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo Veículo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por marca, modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-background pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar inventário: {error.message}</p>
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
                      Foto
                    </th>
                    {!isEmbed && (
                      <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                        Empresa
                      </th>
                    )}
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Veículo
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Ano
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Preço
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Km
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Cor / Câmbio
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-normal text-muted-foreground">
                      Vídeo
                    </th>
                    <th className="relative px-4 py-3.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-4" colSpan={colCount}>
                          <Skeleton className="h-14 w-full" />
                        </td>
                      </tr>
                    ))}

                  {!isLoading && items.length === 0 && (
                    <tr>
                      <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Nenhum veículo encontrado. Use &quot;Sincronizar&quot; ou &quot;Novo Veículo&quot; para adicionar.
                      </td>
                    </tr>
                  )}

                  {items.map((item, i) => {
                    const photoUrl = getPhotoUrl(item);
                    const vehicleName = [item.brand, item.model, item.version]
                      .filter(Boolean)
                      .map((part) => decodeInventoryDisplayText(part))
                      .join(" ");
                    return (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-muted/30 animate-fade-in"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          {photoUrl ? (
                            <div className="h-12 w-16 rounded overflow-hidden bg-muted flex-shrink-0">
                              <img
                                src={photoUrl}
                                alt={vehicleName}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="h-12 w-16 rounded bg-muted flex items-center justify-center">
                              <Car className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </td>
                        {!isEmbed && (
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                            {item.tenants?.name ?? "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          <div>
                            <span className="font-medium">{vehicleName}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {item.year ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                          {formatPrice(item.price)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {item.mileage != null ? `${item.mileage.toLocaleString("pt-BR")} km` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                          {[item.color, item.transmission]
                            .filter(Boolean)
                            .map((part) => decodeInventoryDisplayText(part))
                            .join(" / ") || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge
                            variant={
                              item.status === "available"
                                ? "default"
                                : item.status === "sold"
                                ? "secondary"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {item.status === "available"
                              ? "Disponível"
                              : item.status === "sold"
                              ? "Vendido"
                              : "Reservado"}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {item.video_details ? (
                            <a
                              href={item.video_details}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                            >
                              <Video className="h-3.5 w-3.5" />
                              Ver
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-x-2">
                            {item.detail_url && (
                              <a
                                href={item.detail_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Abrir página"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => setEditItem(item)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteItem(item)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <CreateInventoryDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditInventoryDialog
        item={editItem}
        open={!!editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
      />
      <DeleteInventoryDialog
        item={deleteItem}
        open={!!deleteItem}
        onOpenChange={(o) => !o && setDeleteItem(null)}
      />
    </div>
  );
}
