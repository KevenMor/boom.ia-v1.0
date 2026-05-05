import {
  AlertTriangle,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Key,
  Globe,
  Sparkles,
  BrainCircuit,
  Search,
  Hexagon,
  Diamond,
  Zap,
  Server,
  Cpu,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProviders } from "@/hooks/useProviders";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateProviderDialog } from "@/components/providers/CreateProviderDialog";
import { DeleteProviderDialog } from "@/components/providers/DeleteProviderDialog";
import { getModelsForProvider } from "@/lib/provider-models";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types/database";

const providerMeta: Record<string, { Icon: LucideIcon; gradient: string; iconClass: string; rowBorder: string }> = {
  OpenAI: {
    Icon: Hexagon,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    rowBorder: "border-l-emerald-500",
  },
  "Google Gemini": {
    Icon: Sparkles,
    gradient: "from-blue-500/20 via-indigo-500/5 to-transparent",
    iconClass: "text-blue-600 dark:text-blue-400",
    rowBorder: "border-l-blue-500",
  },
  Anthropic: {
    Icon: Diamond,
    gradient: "from-amber-500/20 via-orange-500/5 to-transparent",
    iconClass: "text-amber-600 dark:text-amber-400",
    rowBorder: "border-l-amber-500",
  },
  Groq: {
    Icon: Zap,
    gradient: "from-rose-500/20 via-pink-500/5 to-transparent",
    iconClass: "text-rose-600 dark:text-rose-400",
    rowBorder: "border-l-rose-500",
  },
  Ollama: {
    Icon: Server,
    gradient: "from-violet-500/20 via-purple-500/5 to-transparent",
    iconClass: "text-violet-600 dark:text-violet-400",
    rowBorder: "border-l-violet-500",
  },
};

const statusConfig: Record<
  string,
  { label: string; dotClass: string; badgeClass: string }
> = {
  active: {
    label: "Ativo",
    dotClass: "bg-emerald-500 shadow-[0_0_8px_hsl(142_76%_36%/0.45)]",
    badgeClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  degraded: {
    label: "Degradado",
    dotClass: "bg-amber-500 shadow-[0_0_8px_hsl(38_92%_50%/0.35)]",
    badgeClass: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  },
  offline: {
    label: "Offline",
    dotClass: "bg-red-500 shadow-[0_0_8px_hsl(0_84%_60%/0.35)]",
    badgeClass: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  },
};

export default function Providers() {
  const navigate = useNavigate();
  const { data: providers, isLoading, error } = useProviders();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      (providers ?? []).filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())),
    [providers, search],
  );

  const stats = useMemo(() => {
    const list = providers ?? [];
    const withKey = list.filter((p) => p.api_key_encrypted).length;
    const active = list.filter((p) => p.status === "active").length;
    return { total: list.length, withKey, active };
  }, [providers]);

  return (
    <div className="space-y-8 pb-4">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card px-6 py-8 sm:px-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              Infra de inferência
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Provedores de modelo</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Conecte chaves e endpoints dos seus LLMs. Os agentes usam essas credenciais de forma segura e criptografada.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-lg px-3 py-1 font-normal">
                {stats.total} {stats.total === 1 ? "provedor" : "provedores"}
              </Badge>
              <Badge variant="outline" className="rounded-lg border-emerald-500/20 bg-emerald-500/5 px-3 py-1 font-normal text-emerald-700 dark:text-emerald-300">
                {stats.active} ativos
              </Badge>
              <Badge variant="outline" className="rounded-lg px-3 py-1 font-normal">
                {stats.withKey} com API key
              </Badge>
            </div>
            <Button className="gap-2 rounded-xl shadow-sm sm:shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo provedor
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="rounded-xl border-destructive/40">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome do provedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 rounded-xl border-border/60 bg-card pl-10 shadow-sm"
        />
      </div>

      {isLoading && (
        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card shadow-sm">
          <div className="min-w-[640px] divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-52 max-w-full" />
                </div>
                <Skeleton className="hidden h-8 w-28 shrink-0 sm:block" />
                <Skeleton className="hidden h-8 w-48 shrink-0 md:block" />
                <Skeleton className="h-8 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && (providers?.length ?? 0) === 0 && (
        <Card className="flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/80 bg-muted/20 py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-transparent ring-1 ring-border/60">
            <Sparkles className="h-8 w-8 text-primary/80" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum provedor cadastrado</p>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">
            Adicione OpenAI, Gemini, Anthropic ou um endpoint compatível para liberar modelos nos agentes.
          </p>
          <Button variant="outline" className="mt-6 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar provedor
          </Button>
        </Card>
      )}

      {!isLoading && (providers?.length ?? 0) > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 py-14 text-center">
          <p className="text-sm font-medium text-foreground">Nenhum resultado</p>
          <p className="mt-1 text-xs text-muted-foreground">Ajuste o termo de busca ou limpe o filtro.</p>
          <Button variant="link" className="mt-2 h-auto p-0 text-xs" onClick={() => setSearch("")}>
            Limpar busca
          </Button>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="min-w-[200px] pl-5 font-semibold">Provedor</TableHead>
                <TableHead className="hidden min-w-[160px] font-semibold sm:table-cell">Estado</TableHead>
                <TableHead className="hidden min-w-[220px] font-semibold lg:table-cell">Endpoint</TableHead>
                <TableHead className="hidden w-[120px] text-right font-semibold md:table-cell">Catálogo</TableHead>
                <TableHead className="w-14 pr-3 text-right font-semibold">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const meta =
                  providerMeta[p.name] ?? {
                    Icon: Cpu,
                    gradient: "from-primary/20 via-primary/5 to-transparent",
                    iconClass: "text-primary",
                    rowBorder: "border-l-primary",
                  };
                const { Icon } = meta;
                const status = statusConfig[p.status] ?? statusConfig.active;
                const modelCount = getModelsForProvider(p.name).length;

                return (
                  <TableRow
                    key={p.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Editar provedor ${p.name}`}
                    className={cn(
                      "group cursor-pointer border-border/50 animate-fade-in",
                      "hover:bg-muted/40 data-[state=selected]:bg-muted/40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                    style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => navigate(`/providers/${p.id}/edit`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/providers/${p.id}/edit`);
                      }
                    }}
                  >
                    <TableCell className={cn("border-l-4 py-4 pl-4", meta.rowBorder)}>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-border/50",
                            meta.gradient,
                          )}
                        >
                          <Icon className={cn("h-5 w-5", meta.iconClass)} strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{p.name}</p>
                          {p.model_default ? (
                            <p className="truncate font-mono text-xs text-muted-foreground">{p.model_default}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Sem modelo padrão</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
                            <Badge
                              variant="outline"
                              className={cn("gap-1 rounded-md border px-1.5 py-0 text-[10px] font-normal", status.badgeClass)}
                            >
                              <span className={cn("h-1 w-1 rounded-full", status.dotClass)} />
                              {status.label}
                            </Badge>
                            {p.api_key_encrypted ? (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-1.5 py-0 text-[10px] text-emerald-700 dark:text-emerald-300"
                              >
                                <Key className="h-2.5 w-2.5" />
                                Chave
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-1.5 py-0 text-[10px] text-amber-800 dark:text-amber-200"
                              >
                                <Key className="h-2.5 w-2.5" />
                                Sem chave
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-middle sm:table-cell">
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("gap-1.5 rounded-lg border px-2 py-0.5 font-normal", status.badgeClass)}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", status.dotClass)} />
                          {status.label}
                        </Badge>
                        {p.api_key_encrypted ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            <Key className="h-3 w-3" />
                            Chave salva
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="gap-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200"
                          >
                            <Key className="h-3 w-3" />
                            Sem chave
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] align-middle lg:table-cell">
                      {p.base_url ? (
                        <div className="flex min-w-0 items-center gap-2 text-muted-foreground" title={p.base_url}>
                          <Globe className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span className="truncate font-mono text-xs">{p.base_url}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">URL padrão do provedor</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right align-middle md:table-cell">
                      {modelCount > 0 ? (
                        <div className="inline-flex items-center justify-end gap-1.5 text-muted-foreground">
                          <BrainCircuit className="h-3.5 w-3.5 opacity-70" />
                          <span className="text-xs font-medium tabular-nums text-foreground">{modelCount}</span>
                          <span className="text-xs text-muted-foreground">modelos</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-2 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl"
                            aria-label="Ações do provedor"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem
                            className="rounded-lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/providers/${p.id}/edit`);
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="rounded-lg text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteProvider(p);
                            }}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateProviderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteProviderDialog provider={deleteProvider} open={!!deleteProvider} onOpenChange={(o) => !o && setDeleteProvider(null)} />
    </div>
  );
}
