import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Search, Loader2, CheckCircle2, XCircle, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenants } from "@/hooks/useTenants";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { TENANT_MODULES, createDefaultModuleState, type ModuleGroup, type ModuleKey } from "@/lib/tenant-modules";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ModuleState = Record<ModuleKey, boolean>;

interface TenantModuleRow {
  tenantId: string;
  state: ModuleState;
  loading: boolean;
  dirty: boolean;
  saving: boolean;
}

const GROUP_LABELS: Record<ModuleGroup, string> = {
  overview: "Visão geral",
  infrastructure: "Infraestrutura",
  system: "Sistema",
};

const GROUP_ORDER: ModuleGroup[] = ["overview", "infrastructure", "system"];

const MODULES_BY_GROUP = GROUP_ORDER.reduce<Record<ModuleGroup, typeof TENANT_MODULES>>(
  (acc, g) => {
    acc[g] = TENANT_MODULES.filter((m) => m.group === g);
    return acc;
  },
  { overview: [], infrastructure: [], system: [] }
);

function enabledCount(state: ModuleState): number {
  return Object.values(state).filter(Boolean).length;
}

function TenantModulePanel({
  tenantId,
  tenantName,
  row,
  onToggle,
  onSave,
  onEnableAll,
  onDisableAll,
}: {
  tenantId: string;
  tenantName: string;
  row: TenantModuleRow;
  onToggle: (tenantId: string, key: ModuleKey, value: boolean) => void;
  onSave: (tenantId: string) => void;
  onEnableAll: (tenantId: string) => void;
  onDisableAll: (tenantId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = enabledCount(row.state);
  const total = TENANT_MODULES.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{tenantName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {row.loading ? "Carregando..." : `${count} / ${total} módulos ativos`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.dirty && !row.saving && (
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30 bg-amber-500/10">
              Não salvo
            </Badge>
          )}
          {row.saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!row.loading && (
            <div className="flex items-center gap-1">
              <div
                className="h-1.5 rounded-full bg-primary/20 overflow-hidden"
                style={{ width: 60 }}
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right">
                {Math.round((count / total) * 100)}%
              </span>
            </div>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">
          {row.loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {/* Bulk actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => onEnableAll(tenantId)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Ativar todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => onDisableAll(tenantId)}
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  Desativar todos
                </Button>
              </div>

              {/* Modules by group */}
              {GROUP_ORDER.map((group) => (
                <div key={group} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {MODULES_BY_GROUP[group].map((mod) => (
                      <div
                        key={mod.key}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                          row.state[mod.key]
                            ? "border-border bg-muted/20"
                            : "border-border/50 bg-muted/5 opacity-60"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground leading-none">{mod.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{mod.description}</p>
                        </div>
                        <Switch
                          checked={row.state[mod.key]}
                          onCheckedChange={(v) => onToggle(tenantId, mod.key, v)}
                          className="ml-3 shrink-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Save */}
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => onSave(tenantId)}
                  disabled={!row.dirty || row.saving}
                  className="gap-2"
                >
                  {row.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Salvar alterações
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TenantPermissionsPage() {
  const { data: tenants, isLoading: tenantsLoading } = useTenants();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, TenantModuleRow>>({});

  const activeTenants = useMemo(
    () => (tenants ?? []).filter((t) => t.status === "active"),
    [tenants]
  );

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeTenants;
    return activeTenants.filter((t) => t.name.toLowerCase().includes(q));
  }, [activeTenants, search]);

  // Initialize rows for each tenant
  useEffect(() => {
    for (const tenant of activeTenants) {
      if (rows[tenant.id]) continue;
      setRows((prev) => ({
        ...prev,
        [tenant.id]: {
          tenantId: tenant.id,
          state: createDefaultModuleState(),
          loading: true,
          dirty: false,
          saving: false,
        },
      }));

      void (async () => {
        const { data, error } = await supabase
          .from("tenant_modules")
          .select("module_key, enabled")
          .eq("tenant_id", tenant.id);

        if (error) {
          toast.error(`Erro ao carregar módulos de ${tenant.name}`);
          setRows((prev) => ({
            ...prev,
            [tenant.id]: { ...prev[tenant.id], loading: false },
          }));
          return;
        }

        const state = createDefaultModuleState();
        for (const row of data ?? []) {
          const key = String((row as { module_key?: string }).module_key ?? "") as ModuleKey;
          if (key in state) state[key] = (row as { enabled?: boolean }).enabled !== false;
        }

        setRows((prev) => ({
          ...prev,
          [tenant.id]: { ...prev[tenant.id], state, loading: false },
        }));
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenants]);

  const handleToggle = (tenantId: string, key: ModuleKey, value: boolean) => {
    setRows((prev) => ({
      ...prev,
      [tenantId]: {
        ...prev[tenantId],
        state: { ...prev[tenantId].state, [key]: value },
        dirty: true,
      },
    }));
  };

  const handleEnableAll = (tenantId: string) => {
    const state = createDefaultModuleState();
    for (const k of Object.keys(state) as ModuleKey[]) state[k] = true;
    setRows((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], state, dirty: true } }));
  };

  const handleDisableAll = (tenantId: string) => {
    const state = createDefaultModuleState();
    for (const k of Object.keys(state) as ModuleKey[]) state[k] = false;
    setRows((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], state, dirty: true } }));
  };

  const handleSave = async (tenantId: string) => {
    const row = rows[tenantId];
    if (!row) return;
    setRows((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], saving: true } }));

    const payload = TENANT_MODULES.map((mod) => ({
      tenant_id: tenantId,
      module_key: mod.key,
      enabled: row.state[mod.key] !== false,
    }));

    const { error } = await supabase
      .from("tenant_modules")
      .upsert(payload, { onConflict: "tenant_id,module_key" });

    if (error) {
      toast.error("Erro ao salvar módulos: " + error.message);
      setRows((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], saving: false } }));
      return;
    }

    setRows((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], saving: false, dirty: false } }));
    const name = activeTenants.find((t) => t.id === tenantId)?.name ?? tenantId;
    toast.success(`Módulos de "${name}" salvos.`);
  };

  const totalEnabled = useMemo(() => {
    return activeTenants.reduce((acc, t) => {
      const row = rows[t.id];
      if (!row || row.loading) return acc;
      return acc + enabledCount(row.state);
    }, 0);
  }, [activeTenants, rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Permissões por Empresa</h2>
            {!tenantsLoading && (
              <Badge variant="secondary" className="text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {activeTenants.length} empresas
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Gerencie quais módulos ficam visíveis para cada empresa. Alterações entram em vigor imediatamente após salvar.
          </p>
        </div>
      </div>

      {/* Stats */}
      {!tenantsLoading && activeTenants.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Empresas ativas</p>
            <p className="text-2xl font-bold text-foreground mt-1">{activeTenants.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total de módulos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{TENANT_MODULES.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Ativações totais</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{totalEnabled}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Máximo possível</p>
            <p className="text-2xl font-bold text-muted-foreground mt-1">
              {activeTenants.length * TENANT_MODULES.length}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {!tenantsLoading && activeTenants.length > 1 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Tenant panels */}
      {tenantsLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search ? "Nenhuma empresa encontrada" : "Nenhuma empresa ativa"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="mt-2 text-xs text-primary hover:underline">
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTenants.map((tenant) => (
            <TenantModulePanel
              key={tenant.id}
              tenantId={tenant.id}
              tenantName={tenant.name}
              row={rows[tenant.id] ?? {
                tenantId: tenant.id,
                state: createDefaultModuleState(),
                loading: true,
                dirty: false,
                saving: false,
              }}
              onToggle={handleToggle}
              onSave={(id) => void handleSave(id)}
              onEnableAll={handleEnableAll}
              onDisableAll={handleDisableAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
