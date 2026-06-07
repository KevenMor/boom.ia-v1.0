import { Bot, Plus, Search, Copy, Pencil, Play, Link2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAgents, useUpdateAgent } from "@/hooks/useAgents";
import { useModuleActions } from "@/hooks/useModuleActions";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { EditAgentDialog } from "@/components/agents/EditAgentDialog";
import { DeleteAgentDialog } from "@/components/agents/DeleteAgentDialog";
import { toast } from "sonner";
import { getApiBase } from "@/lib/api-client";
import { relationName } from "@/lib/utils";
import type { Agent } from "@/types/database";

const WEBHOOK_BASE = `${getApiBase()}/webhooks`;

export default function Agents() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();
  const { data: agents, isLoading, error } = useAgents(selectedTenantId ?? undefined);
  const { data: tenants } = useTenants();
  const updateAgent = useUpdateAgent();
  const { can } = useModuleActions();
  const canEditAgents = can("agents", "edit");
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  useEffect(() => {
    setEditAgent(null);
    setDeleteAgent(null);
    setCreateOpen(false);
  }, [selectedTenantId]);

  const filtered = (agents ?? []).filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (relationName(a.tenants)?.toLowerCase() ?? "").includes(search.toLowerCase())
  );
  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  const totalAgents = agents?.length ?? 0;

  const handleToggleAgentStatus = async (agent: Agent, checked: boolean) => {
    if (!canEditAgents) return;
    const nextStatus = checked ? "active" : "inactive";
    if (agent.status === nextStatus) return;

    setTogglingAgentId(agent.id);
    try {
      await updateAgent.mutateAsync({ id: agent.id, status: nextStatus });
      toast.success(checked ? `${agent.name} ativado` : `${agent.name} inativado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar status do agente");
    } finally {
      setTogglingAgentId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-x-3">
          <h2 className="text-lg font-medium tracking-tight text-foreground">Agentes</h2>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {totalAgents} configurados
          </span>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Novo Agente
        </Button>
      </div>


      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          placeholder="Buscar agente ou tenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar agentes: {error.message}</p>}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[180px] animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Bot className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum agente encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Crie seu primeiro agente para começar</p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Criar Agente
          </Button>
        </div>
      )}

      {/* Agent Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => {
            const isActive = agent.status === "active";
            const isTest = agent.status === "test";
            const isToggling = togglingAgentId === agent.id;
            const tenantName =
              relationName(agent.tenants)
              ?? tenantNameById.get(agent.tenant_id)
              ?? scopedTenantDisplayName
              ?? "—";
            const webhookUrl = `${WEBHOOK_BASE}?agent_id=${agent.id}`;

            return (
              <div
                key={agent.id}
                className="group flex flex-col rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/30"
              >
                {/* Card Body */}
                <div
                  className="flex flex-1 gap-3 p-4 cursor-pointer"
                  onClick={() => navigate(`/agents/${agent.id}/edit`)}
                >
                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    {agent.avatar_url ? (
                      <img
                        src={agent.avatar_url}
                        alt={agent.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <Bot className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
                      {isTest && (
                        <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
                          Teste
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{tenantName}</p>
                    {agent.model && (
                      <span className="mt-2 inline-block rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {agent.model}
                      </span>
                    )}
                  </div>

                  {/* Quick status toggle */}
                  <div
                    className="flex shrink-0 flex-col items-end gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`agent-status-${agent.id}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        {isActive ? "Ativo" : "Inativo"}
                      </Label>
                      <Switch
                        id={`agent-status-${agent.id}`}
                        checked={isActive}
                        disabled={!canEditAgents || isToggling}
                        onCheckedChange={(checked) => void handleToggleAgentStatus(agent, checked)}
                        aria-label={`${isActive ? "Inativar" : "Ativar"} ${agent.name}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Footer — Actions */}
                <div className="flex items-center border-t border-border px-4 py-2.5">
                  <div className="flex flex-1 items-center gap-1">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => navigate(`/agents/${agent.id}/edit`)}
                    >
                      <Pencil className="h-3 w-3" strokeWidth={1.5} />
                      Editar
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10"
                      onClick={() => navigate(`/agents/${agent.id}/sandbox`)}
                    >
                      <Play className="h-3 w-3" strokeWidth={1.5} />
                      Testar
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/demo/${agent.id}`);
                        toast.success("Link demo copiado!");
                      }}
                    >
                      <Link2 className="h-3 w-3" strokeWidth={1.5} />
                      Demo
                    </button>
                  </div>
                  <button
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success("Webhook copiado!");
                    }}
                    title="Copiar webhook URL"
                  >
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditAgentDialog agent={editAgent} open={!!editAgent} onOpenChange={(o) => !o && setEditAgent(null)} />
      <DeleteAgentDialog agent={deleteAgent} open={!!deleteAgent} onOpenChange={(o) => !o && setDeleteAgent(null)} />
    </div>
  );
}
