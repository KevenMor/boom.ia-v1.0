import { Cpu, CheckCircle2, AlertTriangle, XCircle, Plus, MoreHorizontal, Pencil, Trash2, Key, Globe, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

const providerLogos: Record<string, { icon: string; gradient: string }> = {
  "OpenAI": { icon: "⬡", gradient: "from-emerald-500/20 to-emerald-600/5" },
  "Google Gemini": { icon: "✦", gradient: "from-blue-500/20 to-indigo-500/5" },
  "Anthropic": { icon: "◈", gradient: "from-amber-500/20 to-orange-500/5" },
  "Groq": { icon: "⚡", gradient: "from-rose-500/20 to-pink-500/5" },
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; dotClass: string }> = {
  active: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Active", dotClass: "bg-success" },
  degraded: { icon: <AlertTriangle className="h-3.5 w-3.5" />, label: "Degraded", dotClass: "bg-warning" },
  offline: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Offline", dotClass: "bg-destructive" },
};

export default function Providers() {
  const navigate = useNavigate();
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
        </div>
      )}

      {!isLoading && (providers?.length ?? 0) === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 border-dashed border-2 border-border bg-muted/30">
          <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum provider cadastrado</p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />Adicionar Provider
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {(providers ?? []).map((p, i) => {
          const logo = providerLogos[p.name] ?? { icon: "●", gradient: "from-primary/20 to-primary/5" };
          const status = statusConfig[p.status] ?? statusConfig.active;
          const models = getModelsForProvider(p.name);

          return (
            <Card
              key={p.id}
              className="group relative overflow-hidden border-border bg-card hover:border-primary/30 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Gradient accent top */}
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${logo.gradient.replace('/20', '/80').replace('/5', '/40')}`} />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${logo.gradient} text-xl ring-1 ring-border`}>
                      {logo.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
                          <span className="text-xs text-muted-foreground">{status.label}</span>
                        </span>
                        <span className="text-border">·</span>
                        {p.api_key_encrypted ? (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <Key className="h-3 w-3" /> Configurada
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <Key className="h-3 w-3" /> Sem Key
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/providers/${p.id}/edit`)}>
                        <Pencil className="mr-2 h-3 w-3" />Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteProvider(p)}>
                        <Trash2 className="mr-2 h-3 w-3" />Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Base URL */}
                {p.base_url && (
                  <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-muted/50 w-fit max-w-full">
                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground truncate">{p.base_url}</span>
                  </div>
                )}

                {/* Models */}
                <div className="flex flex-wrap gap-1.5">
                  {models.length > 0 ? (
                    models.map((m) => (
                      <Badge
                        key={m.value}
                        variant={m.value === p.model_default ? "default" : "outline"}
                        className={`text-[11px] ${
                          m.value === p.model_default
                            ? ""
                            : "bg-transparent border-border/60 text-muted-foreground hover:bg-accent/50"
                        }`}
                      >
                        {m.label}
                      </Badge>
                    ))
                  ) : p.model_default ? (
                    <Badge variant="outline" className="text-[11px] bg-transparent border-border/60 text-muted-foreground">
                      {p.model_default}
                    </Badge>
                  ) : null}
                </div>

                {/* Footer stats */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{models.length}</span> modelos disponíveis
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <CreateProviderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditProviderDialog provider={editProvider} open={!!editProvider} onOpenChange={(o) => !o && setEditProvider(null)} />
      <DeleteProviderDialog provider={deleteProvider} open={!!deleteProvider} onOpenChange={(o) => !o && setDeleteProvider(null)} />
    </div>
  );
}
