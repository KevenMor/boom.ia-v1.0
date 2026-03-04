import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreateTool } from "@/hooks/useTools";
import { useTenants } from "@/hooks/useTenants";
import { useAgents } from "@/hooks/useAgents";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { Database, Globe, Server, Search, Car, MapPin, DollarSign, CalendarDays, Link } from "lucide-react";
import type { ToolType } from "@/types/database";

const TOOL_TYPE_META: Record<ToolType, { label: string; icon: any; description: string }> = {
  sql_query: { label: "Consulta SQL", icon: Database, description: "Executa queries no banco do tenant" },
  web_scraper: { label: "Web Scraper", icon: Globe, description: "Busca informações de uma URL" },
  api_rest: { label: "API REST", icon: Server, description: "Chama um endpoint HTTP externo" },
  rag_search: { label: "Busca RAG", icon: Search, description: "Busca semântica nos documentos" },
  inventory_query: { label: "Estoque", icon: Car, description: "Consulta veículos do inventory" },
  nearest_unit: { label: "Unidade Próxima", icon: MapPin, description: "Encontra unidade mais próxima por CEP" },
  fipe_query: { label: "Tabela FIPE", icon: DollarSign, description: "Consulta preço FIPE por marca/modelo/ano" },
  calendar_query: { label: "Agenda", icon: CalendarDays, description: "Consulta e agenda horários no calendário" },
};

const schema = z.object({
  name: z.string().min(2, "Nome obrigatório (snake_case)"),
  description: z.string().min(3, "Descrição obrigatória para o LLM"),
  tool_type: z.enum(["sql_query", "web_scraper", "api_rest", "rag_search", "inventory_query", "nearest_unit", "fipe_query", "calendar_query"]),
  tenant_id: z.string().optional(),
  endpoint: z.string().optional(),
  parameters_json: z.string().optional(),
  execution_json: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function CreateToolDialog({ open, onOpenChange }: Props) {
  const create = useCreateTool();
  const { data: tenants } = useTenants();
  const { data: agents } = useAgents();
  const [toolType, setToolType] = useState<ToolType>("api_rest");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", description: "", tool_type: "api_rest",
      tenant_id: "", endpoint: "",
      parameters_json: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
      execution_json: "{}",
    },
  });

  // Filter agents by selected tenant
  const filteredAgents = agents?.filter((a) =>
    selectedTenantId ? a.tenant_id === selectedTenantId : true
  ) ?? [];

  // Reset agent selection when tenant changes
  useEffect(() => {
    setSelectedAgentIds([]);
  }, [selectedTenantId]);

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  const onSubmit = async (data: FormData) => {
    let functionDef: any = {};
    let executionConfig: any = {};

    try {
      const params = data.parameters_json ? JSON.parse(data.parameters_json) : { type: "object", properties: {} };
      functionDef = { name: data.name, description: data.description, parameters: params };
    } catch {
      toast.error("JSON de parâmetros inválido");
      return;
    }

    try {
      executionConfig = data.execution_json ? JSON.parse(data.execution_json) : {};
    } catch {
      toast.error("JSON de configuração inválido");
      return;
    }

    try {
      const newTool = await create.mutateAsync({
        name: data.name,
        description: data.description,
        type: data.tool_type,
        tool_type: data.tool_type as any,
        tenant_id: data.tenant_id || null,
        endpoint: data.endpoint || null,
        function_def: functionDef,
        execution_config: executionConfig,
      });

      // Auto-link tool to selected agents via agent_tools junction table
      if (selectedAgentIds.length > 0 && newTool?.id) {
        const links = selectedAgentIds.map((agentId) => ({
          agent_id: agentId,
          tool_id: newTool.id,
        }));
        const { error: linkError } = await nexusDb.from("agent_tools").insert(links);
        if (linkError) {
          console.error("[CreateTool] agent_tools link error:", linkError);
          toast.warning(`Tool criada, mas falha ao vincular a ${selectedAgentIds.length} agente(s): ${linkError.message}`);
        } else {
          toast.success(`Tool "${data.name}" criada e vinculada a ${selectedAgentIds.length} agente(s)`);
        }
      } else {
        toast.success(`Tool "${data.name}" criada`);
        if (selectedAgentIds.length === 0) {
          toast.info("⚠️ Nenhum agente selecionado — vincule manualmente na edição do agente para ativar a tool.");
        }
      }

      reset();
      setSelectedAgentIds([]);
      setSelectedTenantId("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? ""));
    }
  };

  const getExecutionPlaceholder = (type: ToolType) => {
    switch (type) {
      case "sql_query": return '{\n  "query_template": "SELECT * FROM {schema}.orders WHERE email = $1 LIMIT 10",\n  "param_mapping": ["email"]\n}';
      case "web_scraper": return '{\n  "default_url": "https://example.com",\n  "max_chars": 8000\n}';
      case "api_rest": return '{\n  "url_template": "https://api.example.com/users/{user_id}",\n  "method": "GET",\n  "headers": {}\n}';
      case "rag_search": return '{\n  "limit": 5\n}';
      case "inventory_query": return '{}';
      case "nearest_unit": return '{}';
      case "fipe_query": return '{}';
      case "calendar_query": return '{}';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Tool</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Tool Type Selection */}
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(TOOL_TYPE_META) as [ToolType, typeof TOOL_TYPE_META[ToolType]][]).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setToolType(key); setValue("tool_type", key); }}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-left text-xs transition-colors ${
                    toolType === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-muted-foreground text-[10px]">{meta.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome (snake_case)</Label>
              <Input {...register("name")} placeholder="consultar_pedidos" className="h-9 bg-background font-mono text-sm" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tenant</Label>
              <Select onValueChange={(v) => {
                const val = v === "global" ? "" : v;
                setValue("tenant_id", val);
                setSelectedTenantId(val);
              }}>
                <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Global" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">🌐 Global (todos)</SelectItem>
                  {tenants?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Agent Linking */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Link className="h-3.5 w-3.5 text-primary" />
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Vincular a Agente(s)
              </Label>
            </div>
            {filteredAgents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                {selectedTenantId ? "Nenhum agente encontrado para este tenant" : "Selecione um tenant para filtrar agentes"}
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-background p-2 space-y-1 max-h-32 overflow-y-auto">
                {filteredAgents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedAgentIds.includes(agent.id)}
                      onCheckedChange={() => toggleAgent(agent.id)}
                    />
                    <span className="text-foreground">{agent.name}</span>
                    <span className="text-muted-foreground text-[10px] ml-auto">{agent.status}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedAgentIds.length > 0 && (
              <p className="text-[10px] text-primary">
                ✓ {selectedAgentIds.length} agente(s) será(ão) vinculado(s) automaticamente
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição (usada pelo LLM)</Label>
            <Input {...register("description")} placeholder="Busca pedidos pelo email ou número do pedido" className="h-9 bg-background" />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          {toolType === "api_rest" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Endpoint</Label>
              <Input {...register("endpoint")} placeholder="https://api.example.com/..." className="h-9 bg-background font-mono text-sm" />
            </div>
          )}

          <Tabs defaultValue="params" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="params" className="text-xs">Parâmetros (Function Def)</TabsTrigger>
              <TabsTrigger value="exec" className="text-xs">Config de Execução</TabsTrigger>
            </TabsList>
            <TabsContent value="params">
              <Textarea
                {...register("parameters_json")}
                placeholder='{ "type": "object", "properties": { "email": { "type": "string" } } }'
                className="min-h-[120px] font-mono text-xs bg-background"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">JSON Schema dos parâmetros que o LLM pode enviar</p>
            </TabsContent>
            <TabsContent value="exec">
              <Textarea
                {...register("execution_json")}
                placeholder={getExecutionPlaceholder(toolType)}
                className="min-h-[120px] font-mono text-xs bg-background"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Configuração específica para execução (varia por tipo)</p>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Criando..." : `Criar Tool${selectedAgentIds.length > 0 ? ` + Vincular (${selectedAgentIds.length})` : ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
