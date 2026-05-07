import { Wrench, Plus, Search, MoreHorizontal, Pencil, Trash2, Database, Globe, Server, Play, BedDouble } from "lucide-react";
import { Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTools } from "@/hooks/useTools";
import { useTenantContext } from "@/contexts/TenantContext";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateToolDialog } from "@/components/tools/CreateToolDialog";
import { EditToolDialog } from "@/components/tools/EditToolDialog";
import { DeleteToolDialog } from "@/components/tools/DeleteToolDialog";
import { TestToolDialog } from "@/components/tools/TestToolDialog";
import type { Tool, ToolType } from "@/types/database";

const TOOL_TYPE_ICON: Record<string, any> = {
  sql_query: Database,
  web_scraper: Globe,
  api_rest: Server,
  rag_search: SearchIcon,
  lodging_consulta: BedDouble,
};

const TOOL_TYPE_LABEL: Record<string, string> = {
  sql_query: "SQL Query",
  web_scraper: "Web Scraper",
  api_rest: "API REST",
  rag_search: "RAG Search",
  lodging_consulta: "Hospedagem (parque)",
};

export default function Tools() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { selectedTenantId } = useTenantContext();
  const { data: tools, isLoading, error } = useTools(selectedTenantId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);
  const [testTool, setTestTool] = useState<Tool | null>(null);

  const filtered = (tools ?? []).filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de Tools</h2>
          <p className="text-sm text-muted-foreground">Ferramentas disponíveis para os agentes (Function Calling)</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova Tool
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar tool..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 bg-background pl-9" />
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar tools: {error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tool encontrada</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tool, i) => {
          const toolType = tool.tool_type || "api_rest";
          const Icon = TOOL_TYPE_ICON[toolType] || Wrench;
          return (
            <Card key={tool.id} className="border-border bg-card p-5 cursor-pointer hover:border-primary/30 transition-colors animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">{tool.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">{tool.description ?? "Sem descrição"}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTestTool(tool)}>
                      <Play className="mr-2 h-3 w-3" />Testar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/tools/${tool.id}/edit`)}>
                      <Pencil className="mr-2 h-3 w-3" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTool(tool)}>
                      <Trash2 className="mr-2 h-3 w-3" />Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {TOOL_TYPE_LABEL[toolType] || toolType}
                </Badge>
                {tool.tenant_id ? (
                  <Badge className="bg-accent/10 text-accent-foreground border-accent/20 text-[10px]">Tenant</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">🌐 Global</Badge>
                )}
                {tool.endpoint && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[10px] font-mono truncate max-w-[140px]">
                    {tool.endpoint}
                  </Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <CreateToolDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditToolDialog tool={editTool} open={!!editTool} onOpenChange={(o) => !o && setEditTool(null)} />
      <DeleteToolDialog tool={deleteTool} open={!!deleteTool} onOpenChange={(o) => !o && setDeleteTool(null)} />
      <TestToolDialog tool={testTool} open={!!testTool} onOpenChange={(o) => !o && setTestTool(null)} />
    </div>
  );
}
