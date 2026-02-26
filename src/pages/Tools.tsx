import { Wrench, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useTools } from "@/hooks/useTools";
import { Skeleton } from "@/components/ui/skeleton";

export default function Tools() {
  const [search, setSearch] = useState("");
  const { data: tools, isLoading, error } = useTools();

  const filtered = (tools ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de Tools</h2>
          <p className="text-sm text-muted-foreground">Ferramentas disponíveis para os agentes</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Tool
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar tool..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-background pl-9" />
      </div>

      {error && (
        <p className="text-sm text-destructive">Erro ao carregar tools: {error.message}</p>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tool encontrada</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tool, i) => (
          <Card
            key={tool.id}
            className="border-border bg-card p-5 cursor-pointer hover:border-primary/30 transition-colors animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Wrench className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{tool.name}</h3>
                <p className="text-xs text-muted-foreground">{tool.description ?? "Sem descrição"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{tool.type}</Badge>
              {tool.endpoint && (
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px]">
                  API
                </Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
