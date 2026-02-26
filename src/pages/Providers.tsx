import { Cpu, CheckCircle2, AlertTriangle, XCircle, Plus, MoreHorizontal, Pencil, Trash2, Key } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProviders } from "@/hooks/useProviders";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProviderDialog } from "@/components/providers/CreateProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { DeleteProviderDialog } from "@/components/providers/DeleteProviderDialog";
import { getModelsForProvider } from "@/lib/provider-models";
import type { Provider } from "@/types/database";

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle2 className="h-4 w-4 text-success" />,
  degraded: <AlertTriangle className="h-4 w-4 text-warning" />,
  offline: <XCircle className="h-4 w-4 text-destructive" />,
};

export default function Providers() {
  const { data: providers, isLoading, error } = useProviders();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Model Providers</h2>
          <p className="text-sm text-muted-foreground">Status e configuração dos provedores de LLM</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Provider
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar providers: {error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      )}

      {!isLoading && (providers?.length ?? 0) === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum provider cadastrado</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(providers ?? []).map((p, i) => (
          <Card key={p.id} className="border-border bg-card p-5 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                  <Cpu className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {statusIcons[p.status] ?? statusIcons.active}
                    <span className="text-xs capitalize text-muted-foreground">{p.status}</span>
                    {p.api_key_encrypted ? (
                      <Badge variant="secondary" className="ml-1 text-[10px] gap-1"><Key className="h-2.5 w-2.5" />API Key ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1 text-[10px] gap-1 text-warning border-warning/30"><Key className="h-2.5 w-2.5" />Sem Key</Badge>
                    )}
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditProvider(p)}>
                    <Pencil className="mr-2 h-3 w-3" />Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteProvider(p)}>
                    <Trash2 className="mr-2 h-3 w-3" />Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 space-y-2">
              {p.base_url && <Badge variant="secondary" className="font-mono text-[10px] truncate max-w-[280px]">{p.base_url}</Badge>}
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const models = getModelsForProvider(p.name);
                  if (models.length > 0) {
                    return models.map((m) => (
                      <Badge key={m.value} variant={m.value === p.model_default ? "default" : "secondary"} className="font-mono text-[10px]">
                        {m.label}
                      </Badge>
                    ));
                  }
                  return p.model_default ? <Badge variant="secondary" className="font-mono text-[10px]">{p.model_default}</Badge> : null;
                })()}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <CreateProviderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditProviderDialog provider={editProvider} open={!!editProvider} onOpenChange={(o) => !o && setEditProvider(null)} />
      <DeleteProviderDialog provider={deleteProvider} open={!!deleteProvider} onOpenChange={(o) => !o && setDeleteProvider(null)} />
    </div>
  );
}
