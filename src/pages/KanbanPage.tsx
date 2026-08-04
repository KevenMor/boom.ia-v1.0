import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Columns3, Loader2, Search } from "lucide-react";
import { useAgents } from "@/hooks/useAgents";
import { useConversations } from "@/hooks/useConversations";
import { useTenantContext } from "@/contexts/TenantContext";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { KanbanCardData } from "@/components/kanban/KanbanCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function KanbanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedTenantId } = useTenantContext();
  const { data: agents, isLoading: agentsLoading } = useAgents(selectedTenantId ?? undefined);

  const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(
    () => sessionStorage.getItem("conv_selectedAgentId") ?? null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const prevTenantRef = useRef(selectedTenantId);

  const setSelectedAgentId = (id: string | null) => {
    setSelectedAgentIdState(id);
    if (id) sessionStorage.setItem("conv_selectedAgentId", id);
    else sessionStorage.removeItem("conv_selectedAgentId");
  };

  useEffect(() => {
    if (prevTenantRef.current === selectedTenantId) return;
    prevTenantRef.current = selectedTenantId;
    setSelectedAgentId(null);
    setSearchTerm("");
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [selectedTenantId, queryClient]);

  useEffect(() => {
    if (!selectedAgentId && agents && agents.length === 1) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  const { data: conversations, isLoading: convsLoading, isError, error } = useConversations(
    selectedAgentId,
    500,
    selectedTenantId,
  );

  const selectedAgent = useMemo(
    () => agents?.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const openCard = (card: KanbanCardData) => {
    if (!selectedAgentId) return;
    sessionStorage.setItem("conv_selectedAgentId", selectedAgentId);
    sessionStorage.setItem("conv_selectedContactKey", card.contactKey);
    navigate("/conversations", {
      state: {
        selectedAgentId,
        selectedContactKey: card.contactKey,
        fromKanban: true,
      },
    });
  };

  if (!selectedAgentId) {
    return (
      <div className="ds-typeui font-plex flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 md:p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
              <Columns3 className="h-5 w-5" strokeWidth={2} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Kanban de atendimentos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Escolha o agente para ver a fila: sem atendimento e com quem está cada conversa.
            </p>
          </div>

          {agentsLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !agents || agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum agente disponível neste workspace.</p>
          ) : (
            <div className="grid w-full max-w-lg gap-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Bot className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {agent.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {agent.status === "active" ? "Ativo" : "Pausado"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ds-typeui font-plex flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tu-label mb-1">Operação</p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.35rem]">
              Kanban de atendimentos
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedAgent ? selectedAgent.name : "Agente"} · clique no card para abrir o chat
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {agents && agents.length > 1 ? (
              <div className="flex max-w-full flex-wrap gap-1.5">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      agent.id === selectedAgentId
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setSelectedAgentId(null);
              }}
            >
              Trocar agente
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar contato, atendente, canal…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyOpen((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-xs font-medium transition-colors",
              onlyOpen
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {onlyOpen ? "Só abertos" : "Todos os status"}
          </button>
        </div>

        {convsLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando fila…
          </div>
        ) : isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-destructive">
            {(error as Error)?.message || "Erro ao carregar conversas"}
          </div>
        ) : (
          <KanbanBoard
            conversations={conversations ?? []}
            agentName={selectedAgent?.name}
            searchTerm={searchTerm}
            onlyOpen={onlyOpen}
            onOpen={openCard}
          />
        )}
      </div>
    </div>
  );
}
