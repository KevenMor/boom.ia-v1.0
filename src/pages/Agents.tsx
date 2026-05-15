import { Bot, Plus, Search, Copy } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAgents } from "@/hooks/useAgents";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);

  const filtered = (agents ?? []).filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (relationName(a.tenants)?.toLowerCase() ?? "").includes(search.toLowerCase())
  );
  const tenantNameById = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight text-foreground">Agentes</h2>
          <p className="text-xs text-muted-foreground">{agents?.length ?? 0} configurados</p>
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

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="mb-3 h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-foreground">Nenhum agente encontrado</p>
          <p className="text-xs text-muted-foreground">Crie seu primeiro agente para começar</p>
        </div>
      )}

      {/* Agent List */}
      <div className="space-y-1">
        {filtered.map((agent) => {
          const isActive = agent.status === "active";
          const isTest = agent.status === "test";
          const tenantName =
            relationName(agent.tenants)
            ?? tenantNameById.get(agent.tenant_id)
            ?? scopedTenantDisplayName
            ?? "—";
          const webhookUrl = `${WEBHOOK_BASE}?agent_id=${agent.id}`;

          return (
            <div
              key={agent.id}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/30 cursor-pointer"
              onClick={() => navigate(`/agents/${agent.id}/edit`)}
            >
              {/* Name + Tenant */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{agent.name}</span>
                  <Badge variant={isActive ? "success" : isTest ? "warning" : "secondary"}>
                    {isActive ? "ATIVO" : isTest ? "TESTE" : "INATIVO"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{tenantName}</span>
              </div>

              {/* Model tag */}
              {agent.model && (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {agent.model}
                </span>
              )}

              {/* Webhook */}
              <div className="hidden items-center gap-1.5 lg:flex">
                <span className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                  {webhookUrl}
                </span>
                <button
                  className="rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("Webhook copiado!");
                  }}
                >
                  <Copy className="h-3 w-3" strokeWidth={1.5} />
                </button>
              </div>

              {/* Actions */}
              <div className="hidden shrink-0 items-center gap-3 text-xs sm:flex">
                <button
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/edit`); }}
                >
                  Editar
                </button>
                <span className="text-border">|</span>
                <button
                  className="text-primary transition-colors duration-150 hover:text-primary/80"
                  onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/sandbox`); }}
                >
                  Testar
                </button>
                <span className="text-border">|</span>
                <button
                  className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(`${window.location.origin}/demo/${agent.id}`);
                    toast.success("Link demo copiado!");
                  }}
                >
                  Demo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditAgentDialog agent={editAgent} open={!!editAgent} onOpenChange={(o) => !o && setEditAgent(null)} />
      <DeleteAgentDialog agent={deleteAgent} open={!!deleteAgent} onOpenChange={(o) => !o && setDeleteAgent(null)} />
    </div>
  );
}
