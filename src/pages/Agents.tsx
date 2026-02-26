import { Bot, Plus, Search, MoreHorizontal, Play, Pause } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockAgents = [
  { id: "1", name: "Agendamento", tenant: "Clínica Saúde+", model: "gpt-4o", version: 5, status: "active", msgs24h: 342, env: "prod" },
  { id: "2", name: "Suporte Técnico", tenant: "Auto Peças JM", model: "claude-sonnet-4-20250514", version: 3, status: "active", msgs24h: 189, env: "prod" },
  { id: "3", name: "Atendente Imóveis", tenant: "Imobiliária Lar", model: "gemini-2.0-flash", version: 8, status: "paused", msgs24h: 0, env: "prod" },
  { id: "4", name: "Matrículas", tenant: "Escola Saber", model: "gpt-4o-mini", version: 1, status: "active", msgs24h: 56, env: "staging" },
  { id: "5", name: "Delivery Bot", tenant: "Restaurante Sabor", model: "deepseek-chat", version: 4, status: "active", msgs24h: 412, env: "prod" },
];

export default function Agents() {
  const [search, setSearch] = useState("");

  const filtered = mockAgents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.tenant.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agentes</h2>
          <p className="text-sm text-muted-foreground">{mockAgents.length} agentes configurados</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar agente ou tenant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 bg-background pl-9"
        />
      </div>

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
                  <p className="text-xs text-muted-foreground">{agent.tenant}</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Abrir Studio</DropdownMenuItem>
                  <DropdownMenuItem>Sandbox</DropdownMenuItem>
                  <DropdownMenuItem>Conversas</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    {agent.status === "active" ? "Pausar" : "Ativar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-mono text-[10px]">{agent.model}</Badge>
              <Badge variant="secondary" className="text-[10px]">v{agent.version}</Badge>
              <Badge
                className={
                  agent.env === "prod"
                    ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px]"
                    : "bg-warning/10 text-warning border-warning/20 hover:bg-warning/20 text-[10px]"
                }
              >
                {agent.env}
              </Badge>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1.5">
                {agent.status === "active" ? (
                  <Play className="h-3 w-3 text-success" />
                ) : (
                  <Pause className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-xs capitalize text-muted-foreground">{agent.status === "active" ? "Ativo" : "Pausado"}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {agent.msgs24h} msgs/24h
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
