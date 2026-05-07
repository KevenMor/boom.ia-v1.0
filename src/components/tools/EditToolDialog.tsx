import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ChatwootAssignRules, type AssignRule } from "./ChatwootAssignRules";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdateTool } from "@/hooks/useTools";
import { useTenants } from "@/hooks/useTenants";
import { toast } from "sonner";
import type { Tool, ToolType } from "@/types/database";
import { Database, Globe, Server, Search, Car, MapPin, DollarSign, CalendarDays, UserCheck, Bell, Building2, Images, BedDouble } from "lucide-react";

const TOOL_TYPE_META: Record<ToolType, { label: string; icon: any }> = {
  sql_query: { label: "Consulta SQL", icon: Database },
  web_scraper: { label: "Web Scraper", icon: Globe },
  api_rest: { label: "API REST", icon: Server },
  rag_search: { label: "Busca RAG", icon: Search },
  inventory_query: { label: "Estoque", icon: Car },
  nearest_unit: { label: "Unidade Próxima", icon: MapPin },
  fipe_query: { label: "Tabela FIPE", icon: DollarSign },
  calendar_query: { label: "Agenda", icon: CalendarDays },
  chatwoot_assign: { label: "Atribuir Agente", icon: UserCheck },
  send_notification: { label: "Notificação", icon: Bell },
  omnibees_availability: { label: "Omnibees (hotel)", icon: Building2 },
  suite_gallery_query: { label: "Galeria", icon: Images },
  lodging_consulta: { label: "Hospedagem (parque)", icon: BedDouble },
};

const schema = z.object({
  name: z.string().min(2),
  description: z.string().min(3),
  tool_type: z.enum(["sql_query", "web_scraper", "api_rest", "rag_search", "inventory_query", "nearest_unit", "fipe_query", "calendar_query", "chatwoot_assign", "send_notification", "omnibees_availability", "suite_gallery_query", "lodging_consulta"]),
  tenant_id: z.string().optional(),
  endpoint: z.string().optional(),
  parameters_json: z.string().optional(),
  execution_json: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props { tool: Tool | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function EditToolDialog({ tool, open, onOpenChange }: Props) {
  const update = useUpdateTool();
  const { data: tenants } = useTenants();
  const [toolType, setToolType] = useState<ToolType>("api_rest");

  const { register, handleSubmit, setValue, reset, getValues } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tool) {
      const tt = (tool.tool_type || "api_rest") as ToolType;
      setToolType(tt);
      reset({
        name: tool.name,
        description: tool.description ?? "",
        tool_type: tt,
        tenant_id: tool.tenant_id ?? "",
        endpoint: tool.endpoint ?? "",
        parameters_json: JSON.stringify(
          (tool.function_def as any)?.parameters || { type: "object", properties: {} },
          null, 2
        ),
        execution_json: JSON.stringify(tool.execution_config || {}, null, 2),
      });
    }
  }, [tool, reset]);

  const onSubmit = async (data: FormData) => {
    if (!tool) return;

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
      await update.mutateAsync({
        id: tool.id,
        name: data.name,
        description: data.description || null,
        type: data.tool_type,
        tool_type: data.tool_type as any,
        tenant_id: data.tenant_id || null,
        endpoint: data.endpoint || null,
        function_def: functionDef,
        execution_config: executionConfig,
      });
      toast.success("Tool atualizada");
      onOpenChange(false);
    } catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Tool</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Tool type indicator */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            {(() => { const Icon = TOOL_TYPE_META[toolType]?.icon || Server; return <Icon className="h-4 w-4 text-primary" />; })()}
            <Select value={toolType} onValueChange={(v) => { setToolType(v as ToolType); setValue("tool_type", v as any); }}>
              <SelectTrigger className="h-7 w-auto border-0 bg-transparent p-0 text-xs font-medium"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TOOL_TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-9 bg-background font-mono text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tenant</Label>
              <Select value={tool?.tenant_id ?? "global"} onValueChange={(v) => setValue("tenant_id", v === "global" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">🌐 Global</SelectItem>
                  {tenants?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Input {...register("description")} className="h-9 bg-background" />
          </div>

          {toolType === "web_scraper" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">URL padrão (scraping)</Label>
              <Input
                placeholder="https://pplmotors.com.br/Veiculos"
                defaultValue={(tool?.execution_config as any)?.default_url ?? ""}
                onChange={(e) => {
                  try {
                    const current = JSON.parse(getValues("execution_json") || "{}");
                    current.default_url = e.target.value;
                    setValue("execution_json", JSON.stringify(current, null, 2));
                  } catch {
                    setValue("execution_json", JSON.stringify({ default_url: e.target.value }, null, 2));
                  }
                }}
                className="h-9 bg-background font-mono text-sm"
              />
            </div>
          )}

          {toolType === "lodging_consulta" && (
            <p className="text-[11px] text-muted-foreground rounded-md border border-border bg-muted/30 p-2">
              Consulta interna (calendário + tarifas). Defina o <strong>tenant</strong> do parque; não é necessário endpoint.
            </p>
          )}

          {toolType === "api_rest" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Endpoint</Label>
              <Input {...register("endpoint")} className="h-9 bg-background font-mono text-sm" />
            </div>
          )}

          {toolType === "chatwoot_assign" && (
            <ChatwootAssignRules
              compact
              initialRules={((tool?.execution_config as any)?.rules || []) as AssignRule[]}
              defaultAssigneeId={(tool?.execution_config as any)?.assignee_id ?? null}
              defaultTeamId={(tool?.execution_config as any)?.team_id ?? null}
              onChange={(rules, defAssignee, defTeam) => {
                const config: Record<string, any> = { assignee_id: defAssignee, team_id: defTeam, rules };
                setValue("execution_json", JSON.stringify(config, null, 2));
              }}
            />
          )}

          {toolType === "send_notification" && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Bell className="h-4 w-4 text-primary" />
                Configuração de Notificação
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Canal</Label>
                <Select defaultValue={(tool?.execution_config as any)?.channel || "chatwoot_message"} onValueChange={(v) => {
                  try {
                    const cur = JSON.parse(getValues("execution_json") || "{}");
                    cur.channel = v;
                    setValue("execution_json", JSON.stringify(cur, null, 2));
                  } catch {
                    setValue("execution_json", JSON.stringify({ channel: v }, null, 2));
                  }
                }}>
                  <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chatwoot_message">💬 Nota privada Chatwoot</SelectItem>
                    <SelectItem value="webhook">🔗 Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Conversation ID (grupo destino)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 123"
                  defaultValue={(tool?.execution_config as any)?.conversation_id ?? ""}
                  className="h-9 bg-background font-mono text-sm border-border"
                  onChange={(e) => {
                    try {
                      const cur = JSON.parse(getValues("execution_json") || "{}");
                      cur.conversation_id = e.target.value ? Number(e.target.value) : null;
                      setValue("execution_json", JSON.stringify(cur, null, 2));
                    } catch {
                      setValue("execution_json", JSON.stringify({ conversation_id: e.target.value ? Number(e.target.value) : null }, null, 2));
                    }
                  }}
                />
                <p className="text-[10px] text-muted-foreground">ID do grupo no Chatwoot onde as notificações serão enviadas</p>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                💡 O agente IA compõe a mensagem automaticamente com base no contexto da conversa (nome, telefone, resumo, etc).
              </p>
            </div>
          )}

          <Tabs defaultValue="params" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="params" className="text-xs">Parâmetros</TabsTrigger>
              <TabsTrigger value="exec" className="text-xs">Config Execução</TabsTrigger>
            </TabsList>
            <TabsContent value="params">
              <Textarea {...register("parameters_json")} className="min-h-[120px] font-mono text-xs bg-background" />
            </TabsContent>
            <TabsContent value="exec">
              <Textarea {...register("execution_json")} className="min-h-[120px] font-mono text-xs bg-background" />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={update.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
