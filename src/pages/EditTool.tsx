import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ArrowLeft, Wrench, Save, Loader2, Database, Globe, Server, Search, Car, MapPin, DollarSign, CalendarDays, UserCheck, Bell, Building2 } from "lucide-react";
import { ChatwootAssignRules, type AssignRule } from "@/components/tools/ChatwootAssignRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useTools, useUpdateTool } from "@/hooks/useTools";
import { useTenants } from "@/hooks/useTenants";
import { toast } from "sonner";
import type { Tool, ToolType } from "@/types/database";

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
};

const schema = z.object({
  name: z.string().min(2),
  description: z.string().min(3),
  tool_type: z.enum(["sql_query", "web_scraper", "api_rest", "rag_search", "inventory_query", "nearest_unit", "fipe_query", "calendar_query", "chatwoot_assign", "send_notification", "omnibees_availability"]),
  tenant_id: z.string().optional(),
  endpoint: z.string().optional(),
  parameters_json: z.string().optional(),
  execution_json: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function EditTool() {
  const { toolId } = useParams<{ toolId: string }>();
  const navigate = useNavigate();
  const update = useUpdateTool();
  const { data: tools, isLoading } = useTools();
  const { data: tenants } = useTenants();
  const [toolType, setToolType] = useState<ToolType>("api_rest");

  const tool = tools?.find((t) => t.id === toolId) ?? null;

  const { register, handleSubmit, setValue, reset, getValues } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tool) {
      const tt = (tool.tool_type || "api_rest") as ToolType;
      setToolType(tt);
      reset({
        name: tool.name, description: tool.description ?? "",
        tool_type: tt, tenant_id: tool.tenant_id ?? "",
        endpoint: tool.endpoint ?? "",
        parameters_json: JSON.stringify((tool.function_def as any)?.parameters || { type: "object", properties: {} }, null, 2),
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
    } catch { toast.error("JSON de parâmetros inválido"); return; }
    try { executionConfig = data.execution_json ? JSON.parse(data.execution_json) : {}; } catch { toast.error("JSON de configuração inválido"); return; }
    try {
      await update.mutateAsync({
        id: tool.id, name: data.name, description: data.description || null,
        type: data.tool_type, tool_type: data.tool_type as any,
        tenant_id: data.tenant_id || null, endpoint: data.endpoint || null,
        function_def: functionDef, execution_config: executionConfig,
      });
      toast.success("Tool atualizada");
      navigate("/tools");
    } catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Wrench className="mb-4 h-12 w-12" />
        <p>Tool não encontrada</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/tools")}>Voltar</Button>
      </div>
    );
  }

  const Icon = TOOL_TYPE_META[toolType]?.icon || Server;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/tools")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Editar Tool</h1>
          <p className="text-sm text-muted-foreground">Configure a ferramenta de function calling</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Type & Basic */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Informações Básicas</h3>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <Icon className="h-5 w-5 text-primary" />
            <Select value={toolType} onValueChange={(v) => { setToolType(v as ToolType); setValue("tool_type", v as any); }}>
              <SelectTrigger className="h-9 w-auto border-0 bg-transparent p-0 text-sm font-medium"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TOOL_TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Tenant</Label>
              <Select defaultValue={tool.tenant_id ?? "global"} onValueChange={(v) => setValue("tenant_id", v === "global" ? "" : v)}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">🌐 Global</SelectItem>
                  {tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Descrição</Label>
            <Input {...register("description")} className="h-11 rounded-lg bg-background border-border" />
          </div>

          {toolType === "api_rest" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Endpoint</Label>
              <Input {...register("endpoint")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            </div>
          )}

          {toolType === "chatwoot_assign" && (
            <ChatwootAssignRules
              initialRules={((tool.execution_config as any)?.rules || []) as AssignRule[]}
              defaultAssigneeId={(tool.execution_config as any)?.assignee_id ?? null}
              defaultTeamId={(tool.execution_config as any)?.team_id ?? null}
              roundRobin={(tool.execution_config as any)?.round_robin ?? false}
              assignees={(tool.execution_config as any)?.assignees || []}
              onChange={(rules, defAssignee, defTeam, rr, arr) => {
                const config: Record<string, any> = {
                  assignee_id: defAssignee,
                  team_id: defTeam,
                  rules,
                  round_robin: rr,
                  assignees: arr,
                };
                setValue("execution_json", JSON.stringify(config, null, 2));
              }}
            />
          )}

          {toolType === "send_notification" && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Bell className="h-5 w-5 text-primary" />
                Configuração de Notificação
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Canal de Envio</Label>
                  <Select defaultValue={(tool.execution_config as any)?.channel || "chatwoot_message"} onValueChange={(v) => {
                    try {
                      const cur = JSON.parse(getValues("execution_json") || "{}");
                      cur.channel = v;
                      setValue("execution_json", JSON.stringify(cur, null, 2));
                    } catch {
                      setValue("execution_json", JSON.stringify({ channel: v }, null, 2));
                    }
                  }}>
                    <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chatwoot_message">💬 Nota privada no Chatwoot</SelectItem>
                      <SelectItem value="webhook">🔗 Webhook externo (HTTP POST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Conversation ID (grupo destino)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 123"
                    defaultValue={(tool.execution_config as any)?.conversation_id ?? ""}
                    className="h-11 rounded-lg bg-background border-border font-mono text-sm"
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
                  <p className="text-xs text-muted-foreground">ID da conversa/grupo no Chatwoot onde as notificações serão enviadas</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Como funciona</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O agente IA compõe a mensagem automaticamente com base no contexto da conversa. Não é necessário definir um template fixo.
                </p>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-foreground">📋 Exemplo — Novo Lead Agendado:</p>
                  <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap leading-relaxed">
{`Novo Lead Agendado:

Nome: João Silva
Telefone: (11) 99999-0000
Carro de interesse: HB20 2023
Data agendada: 06/03 às 14:00

Resumo: Cliente se interessou no HB20, falou sobre colocar um Gol 2018 como entrada e financiar o restante.`}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-foreground">🚨 Exemplo — Intervenção Necessária:</p>
                  <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap leading-relaxed">
{`Intervenção necessária no atendimento:

Nome: Maria Souza
Telefone: (21) 98888-1111

Resumo: Cliente tem dúvidas sobre documentação de transferência. Atendimento fora do expediente, foi comunicada que um atendente entrará em contato no primeiro horário.`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {toolType === "web_scraper" && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">URL padrão (scraping)</Label>
              <Input
                placeholder="https://pplmotors.com.br/Veiculos"
                defaultValue={(tool.execution_config as any)?.default_url ?? ""}
                onChange={(e) => {
                  try {
                    const current = JSON.parse(getValues("execution_json") || "{}");
                    current.default_url = e.target.value;
                    setValue("execution_json", JSON.stringify(current, null, 2));
                  } catch {
                    setValue("execution_json", JSON.stringify({ default_url: e.target.value }, null, 2));
                  }
                }}
                className="h-11 rounded-lg bg-background border-border font-mono text-sm"
              />
            </div>
          )}
        </div>

        {/* JSON Config */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Configuração Avançada</h3>

          <Tabs defaultValue="params" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="params">Parâmetros (JSON Schema)</TabsTrigger>
              <TabsTrigger value="exec">Config de Execução</TabsTrigger>
            </TabsList>
            <TabsContent value="params" className="mt-4">
              <Textarea {...register("parameters_json")} className="min-h-[200px] font-mono text-xs bg-background rounded-lg border-border" />
            </TabsContent>
            <TabsContent value="exec" className="mt-4">
              <Textarea {...register("execution_json")} className="min-h-[200px] font-mono text-xs bg-background rounded-lg border-border" />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <Button type="button" variant="outline" className="h-11 rounded-lg px-8" onClick={() => navigate("/tools")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={update.isPending} className="h-11 rounded-lg px-8 gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
