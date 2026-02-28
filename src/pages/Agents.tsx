import { Bot, Plus, Search, MoreHorizontal, Pencil, Trash2, MessageSquare, Copy } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgents } from "@/hooks/useAgents";
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
  const { data: agents, isLoading, error } = useAgents();
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agentes</h2>
          <p className="text-sm text-muted-foreground">{agents?.length ?? 0} agentes configurados</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar agente ou tenant..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-background pl-9" />
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar agentes: {error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agente encontrado</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent, i) => (
          <Card
            key={agent.id}
            className="relative overflow-hidden rounded-xl border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Logo / Icon */}
            <div className="flex items-center justify-center rounded-lg bg-gradient-to-br from-card to-muted/40 p-5">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="max-h-14 w-auto object-contain drop-shadow-sm" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="mt-4 text-center">
              <h3 className="text-base font-semibold text-foreground">{agent.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {(agent.tenants as any)?.name ?? "Sem tenant"}
              </p>
              {agent.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
              )}
            </div>

            {/* Tags */}
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] ${agent.status === "active" ? "border-success/30 text-success" : "border-muted-foreground/30 text-muted-foreground"}`}
              >
                {agent.status === "active" ? "Ativo" : "Pausado"}
              </Badge>
              {agent.model && <Badge variant="secondary" className="text-[10px]">{agent.model}</Badge>}
              {(agent.providers as any)?.name && <Badge variant="secondary" className="text-[10px]">{(agent.providers as any).name}</Badge>}
            </div>

            {/* Webhook URL */}
            <div className="mt-4">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Webhook</p>
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                <code className="flex-1 truncate text-[11px] text-muted-foreground select-all">
                  {`${WEBHOOK_BASE}?agent_id=${agent.id}`}
                </code>
                <button
                  className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(`${WEBHOOK_BASE}?agent_id=${agent.id}`);
                    toast.success("URL do webhook copiada!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 text-sm"
                onClick={() => navigate(`/agents/${agent.id}/edit`)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
              <Button
                className="flex-1 text-sm"
                onClick={() => navigate(`/agents/${agent.id}/sandbox`)}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                Testar
              </Button>
            </div>

            {/* More menu - top right */}
            <div className="absolute right-3 top-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/agents/${agent.id}/edit`)}>
                    <Pencil className="mr-2 h-3 w-3" />Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteAgent(agent)}>
                    <Trash2 className="mr-2 h-3 w-3" />Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditAgentDialog agent={editAgent} open={!!editAgent} onOpenChange={(o) => !o && setEditAgent(null)} />
      <DeleteAgentDialog agent={deleteAgent} open={!!deleteAgent} onOpenChange={(o) => !o && setDeleteAgent(null)} />
    </div>
  );
}
