import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateTool } from "@/hooks/useTools";
import { useTenants } from "@/hooks/useTenants";
import { toast } from "sonner";
import { Database, Globe, Server, Search, Car, MapPin, DollarSign, CalendarDays } from "lucide-react";
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
  const [toolType, setToolType] = useState<ToolType>("api_rest");

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", description: "", tool_type: "api_rest",
      tenant_id: "", endpoint: "",
      parameters_json: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
      execution_json: "{}",
    },
  });

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
      await create.mutateAsync({
        name: data.name,
        description: data.description,
        type: data.tool_type,
        tool_type: data.tool_type as any,
        tenant_id: data.tenant_id || null,
        endpoint: data.endpoint || null,
        function_def: functionDef,
        execution_config: executionConfig,
      });
      toast.success(`Tool "${data.name}" criada`);
      reset();
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
              <Select onValueChange={(v) => setValue("tenant_id", v === "global" ? "" : v)}>
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
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Criando..." : "Criar Tool"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
