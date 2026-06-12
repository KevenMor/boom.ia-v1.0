import { Plus, Search, MoreHorizontal, Pencil, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { getToolTypeMeta, toolCardTitle, toolTypeBadgeLabel } from "@/lib/tool-type-meta";
import { cn } from "@/lib/utils";
import type { Tool } from "@/types/database";

export default function Tools() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { selectedTenantId } = useTenantContext();
  const { data: tools, isLoading, error } = useTools(selectedTenantId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);
  const [testTool, setTestTool] = useState<Tool | null>(null);

  const filtered = (tools ?? []).filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalTools = tools?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-x-3">
            <h2 className="text-lg font-medium tracking-tight text-foreground">Catálogo de Tools</h2>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {totalTools} {totalTools === 1 ? "ferramenta" : "ferramentas"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Ferramentas disponíveis para os agentes (Function Calling)
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Nova Tool
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <Input
          placeholder="Buscar tool..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 bg-background pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">Erro ao carregar tools: {error.message}</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[148px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma tool encontrada</p>
          <p className="mt-1 text-xs text-muted-foreground">Crie uma ferramenta ou ajuste a busca</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((tool) => {
          const meta = getToolTypeMeta(tool.tool_type);
          const Icon = meta.icon;
          const title = toolCardTitle(tool);

          return (
            <article
              key={tool.id}
              className="group flex flex-col rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:border-primary/25 hover:shadow-md"
            >
              <div className="flex gap-3 p-4">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    meta.bgClass
                  )}
                >
                  <Icon className={cn("h-5 w-5", meta.iconClass)} strokeWidth={1.75} aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-medium leading-snug tracking-tight text-foreground">
                        {title}
                      </h3>
                      <p
                        className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground/90"
                        title={tool.name}
                      >
                        {tool.name}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setTestTool(tool)}>
                          <Play className="mr-2 h-3.5 w-3.5" />
                          Testar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/tools/${tool.id}/edit`)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTool(tool)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {tool.description ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {tool.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/80 px-4 py-2.5">
                <Badge variant="secondary" className="text-[10px] font-medium tracking-wide">
                  {toolTypeBadgeLabel(tool.tool_type)}
                </Badge>
                {tool.tenant_id ? (
                  <Badge
                    variant="outline"
                    className="border-primary/20 bg-primary/5 text-[10px] font-medium text-primary"
                  >
                    Tenant
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-medium">
                    Global
                  </Badge>
                )}
              </div>
            </article>
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
