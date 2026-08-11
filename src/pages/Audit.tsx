import { useState, useMemo } from "react";
import { Search, ShieldAlert, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { useTenants } from "@/hooks/useTenants";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const RESOURCE_LABELS: Record<string, string> = {
  occurrence: "Ocorrência",
  inventory: "Inventário",
  contact: "Contato",
  agent: "Agente",
  user: "Usuário",
  tenant: "Tenant",
  user_acl: "Permissões",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Edição",
  delete: "Exclusão",
};

function actionBadgeClass(action: string) {
  if (action === "create") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (action === "update") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (action === "delete") return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return "";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function Audit() {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: tenantsData } = useTenants();
  const tenants = tenantsData ?? [];

  const filters = useMemo(
    () => ({
      tenant_id: tenantFilter !== "all" ? tenantFilter : undefined,
      resource: resourceFilter !== "all" ? resourceFilter : undefined,
      action: actionFilter !== "all" ? actionFilter : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [tenantFilter, resourceFilter, actionFilter, page]
  );

  const { data, isLoading, refetch, isFetching } = useAuditLogs(filters);
  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter(
      (l) =>
        l.user_email?.toLowerCase().includes(q) ||
        l.user_name?.toLowerCase().includes(q) ||
        l.resource_label?.toLowerCase().includes(q) ||
        l.resource_id?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string) => { setter(v); setPage(0); };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{total} registro(s)</span>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-0 max-w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar usuário ou registro..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 bg-background pl-9" />
        </div>
        <Select value={tenantFilter} onValueChange={handleFilterChange(setTenantFilter)}>
          <SelectTrigger className="w-full sm:w-[180px] h-10"><SelectValue placeholder="Tenant" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tenants</SelectItem>
            {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={resourceFilter} onValueChange={handleFilterChange(setResourceFilter)}>
          <SelectTrigger className="w-full sm:w-[160px] h-10"><SelectValue placeholder="Recurso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os recursos</SelectItem>
            {Object.entries(RESOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={handleFilterChange(setActionFilter)}>
          <SelectTrigger className="w-full sm:w-[140px] h-10"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            <SelectItem value="create">Criação</SelectItem>
            <SelectItem value="update">Edição</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Data / Hora</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Recurso</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Registro</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Ação</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum registro de auditoria encontrado.</td></tr>
              )}
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-foreground leading-tight">{log.user_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{log.user_email ?? "—"}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
                    {(log.tenants as { name?: string } | null)?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">{RESOURCE_LABELS[log.resource] ?? log.resource}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <div className="text-sm text-foreground truncate">{log.resource_label ?? log.resource_id ?? "—"}</div>
                    {log.resource_label && log.resource_id && (
                      <div className="text-[11px] text-muted-foreground font-mono truncate">{log.resource_id}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="outline" className={cn("text-[11px]", actionBadgeClass(log.action))}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {log.metadata.fields && Array.isArray(log.metadata.fields) && (
                          <div>Campos: {(log.metadata.fields as string[]).join(", ")}</div>
                        )}
                        {log.metadata.email && <div>Email: {String(log.metadata.email)}</div>}
                        {log.metadata.slug && <div>Slug: {String(log.metadata.slug)}</div>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
