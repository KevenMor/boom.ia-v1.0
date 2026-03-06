import { Bot, Plus, Search, MoreHorizontal, Pencil, Trash2, MessageSquare, Copy, Link2, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgents } from "@/hooks/useAgents";
import { useTenantContext } from "@/contexts/TenantContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { EditAgentDialog } from "@/components/agents/EditAgentDialog";
import { DeleteAgentDialog } from "@/components/agents/DeleteAgentDialog";
import { toast } from "sonner";
import type { Agent } from "@/types/database";

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-test`;

export default function Agents() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { selectedTenantId } = useTenantContext();
  const { data: agents, isLoading, error } = useAgents(selectedTenantId ?? undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);

  const filtered = (agents ?? []).filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.tenants as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Agentes</h2>
          <p className="text-sm text-muted-foreground">{agents?.length ?? 0} agentes configurados</p>
        </div>
        <Button className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar agente ou tenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 rounded-xl bg-card border-border/60 pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar agentes: {error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nenhum agente encontrado</p>
          <p className="text-xs text-muted-foreground">Crie seu primeiro agente para começar</p>
        </div>
      )}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent, i) => {
          const isActive = agent.status === "active";
          const tenantName = (agent.tenants as any)?.name ?? "Sem tenant";
          const providerName = (agent.providers as any)?.name;
          const webhookUrl = `${WEBHOOK_BASE}?agent_id=${agent.id}`;
          const demoUrl = `${window.location.origin}/demo/${agent.id}`;

          return (
            <div
              key={agent.id}
              className="group relative flex flex-col rounded-2xl border border-border/50 bg-card transition-all duration-300 hover:border-border hover:shadow-[0_8px_30px_-12px_hsl(var(--foreground)/0.08)] animate-fade-in overflow-hidden"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Top section — Avatar + Info */}
              <div className="flex items-start gap-4 p-5 pb-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {agent.avatar_url ? (
                    <img
                      src={agent.avatar_url}
                      alt={agent.name}
                      className="h-12 w-12 rounded-xl object-cover ring-2 ring-border/30"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Bot className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  {/* Status dot */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${isActive ? "bg-success" : "bg-muted-foreground/40"}`}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{tenantName}</p>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2 leading-relaxed">
                      {agent.description}
                    </p>
                  )}
                </div>

                {/* Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem onClick={() => navigate(`/agents/${agent.id}/edit`)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteAgent(agent)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 px-5 pb-3 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground/50"}`} />
                  {isActive ? "Ativo" : "Pausado"}
                </span>
                {agent.model && (
                  <span className="inline-flex items-center rounded-md bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {agent.model}
                  </span>
                )}
                {providerName && (
                  <span className="inline-flex items-center rounded-md bg-secondary/10 px-2 py-0.5 text-[10px] font-medium text-secondary">
                    {providerName}
                  </span>
                )}
              </div>

              {/* Webhook */}
              <div className="mx-5 mb-3 rounded-xl bg-muted/40 border border-border/40 px-3 py-2 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="flex-1 truncate text-[11px] text-muted-foreground select-all">
                  {webhookUrl}
                </span>
                <button
                  className="shrink-0 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-background hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("Webhook copiado!");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              {/* Actions — bottom bar */}
              <div className="mt-auto border-t border-border/40 flex">
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  onClick={() => navigate(`/agents/${agent.id}/edit`)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <span className="w-px bg-border/40" />
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                  onClick={() => navigate(`/agents/${agent.id}/sandbox`)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Testar
                </button>
                <span className="w-px bg-border/40" />
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(demoUrl);
                    toast.success("Link demo copiado!");
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
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
