import { Bot, Plus, Search, MoreHorizontal, Play, Pause, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
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
import type { Agent } from "@/types/database";

export default function Agents() {
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent, i) => (
          <Card
            key={agent.id}
            className="border-border bg-card p-5 transition-colors hover:border-primary/30 cursor-pointer animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{(agent.tenants as any)?.name ?? "—"}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditAgent(agent)}>
                    <Pencil className="mr-2 h-3 w-3" />Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteAgent(agent)}>
                    <Trash2 className="mr-2 h-3 w-3" />Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {agent.description && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
            )}

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {agent.model && <Badge variant="secondary" className="font-mono text-[10px]">{agent.model}</Badge>}
              {(agent.providers as any)?.name && <Badge variant="secondary" className="text-[10px]">{(agent.providers as any).name}</Badge>}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1.5">
                {agent.status === "active" ? <Play className="h-3 w-3 text-success" /> : <Pause className="h-3 w-3 text-muted-foreground" />}
                <span className="text-xs capitalize text-muted-foreground">{agent.status === "active" ? "Ativo" : "Pausado"}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">temp: {agent.temperature}</span>
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
