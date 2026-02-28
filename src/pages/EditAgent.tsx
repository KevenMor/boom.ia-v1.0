import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents, useUpdateAgent } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useProviders } from "@/hooks/useProviders";
import { toast } from "sonner";
import { getModelsForProvider } from "@/lib/provider-models";
import { ChatwootConfigSection } from "@/components/agents/ChatwootConfigSection";
import { AgentAvatarUpload } from "@/components/agents/AgentAvatarUpload";
import type { Agent } from "@/types/database";

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-test`;

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  tenant_id: z.string().min(1),
  provider_id: z.string().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  top_k: z.number().min(1).max(100),
  status: z.string(),
});

type FormData = z.infer<typeof schema>;

export default function EditAgent() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const update = useUpdateAgent();
  const { data: agents, isLoading } = useAgents();
  const { data: tenants } = useTenants();
  const { data: providers } = useProviders();

  const agent = agents?.find((a) => a.id === agentId) ?? null;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [temp, setTemp] = useState(0.7);
  const [topP, setTopP] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [readDelay, setReadDelay] = useState(1.5);
  const [typingDelay, setTypingDelay] = useState(0.8);
  const [blockGap, setBlockGap] = useState(1.2);
  const [debounceMs, setDebounceMs] = useState(0);
  const [chatwootUrl, setChatwootUrl] = useState("");
  const [chatwootApiToken, setChatwootApiToken] = useState("");
  const [chatwootAccountId, setChatwootAccountId] = useState("");

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (agent) {
      const cfg = agent.config || {};
      setAvatarUrl(agent.avatar_url ?? null);
      reset({
        name: agent.name, description: agent.description ?? "", tenant_id: agent.tenant_id,
        provider_id: agent.provider_id ?? "", model: agent.model ?? "",
        system_prompt: agent.system_prompt ?? "", temperature: agent.temperature,
        top_p: (cfg as any).top_p ?? 0.8, top_k: (cfg as any).top_k ?? 40, status: agent.status,
      });
      setTemp(agent.temperature);
      setTopP((cfg as any).top_p ?? 0.8);
      setTopK((cfg as any).top_k ?? 40);
      setReadDelay(((cfg as any).read_delay_ms ?? 1500) / 1000);
      setTypingDelay(((cfg as any).typing_delay_ms ?? 800) / 1000);
      setBlockGap(((cfg as any).block_gap_ms ?? 1200) / 1000);
      setDebounceMs(((cfg as any).message_debounce_ms ?? 0) / 1000);
      setChatwootUrl((cfg as any).chatwoot_url ?? "");
      setChatwootApiToken((cfg as any).chatwoot_api_token ?? "");
      setChatwootAccountId((cfg as any).chatwoot_account_id ?? "");
    }
  }, [agent, reset]);

  const onSubmit = async (data: FormData) => {
    if (!agent) return;
    try {
      const currentConfig = (agent.config || {}) as Record<string, unknown>;
      const { top_p, top_k, ...rest } = data;
      await update.mutateAsync({
        id: agent.id, ...rest, avatar_url: avatarUrl,
        description: rest.description || null, provider_id: rest.provider_id || null,
        model: rest.model || null, system_prompt: rest.system_prompt || null,
        config: {
          ...currentConfig, top_p, top_k,
          read_delay_ms: Math.round(readDelay * 1000), typing_delay_ms: Math.round(typingDelay * 1000),
          block_gap_ms: Math.round(blockGap * 1000), message_debounce_ms: Math.round(debounceMs * 1000),
          chatwoot_url: chatwootUrl || undefined, chatwoot_api_token: chatwootApiToken || undefined,
          chatwoot_account_id: chatwootAccountId || undefined,
        },
      });
      toast.success("Agente atualizado");
      navigate("/agents");
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? ""));
    }
  };

  const activeTenants = (tenants ?? []).filter((t) => t.status === "active");

  if (isLoading) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Bot className="mb-4 h-12 w-12" />
        <p>Agente não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/agents")}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/agents")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Editar Agente</h1>
          <p className="text-sm text-muted-foreground">Configure o comportamento, modelo e integrações do agente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Avatar + Basic Info */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Informações Básicas</h3>

          <AgentAvatarUpload agentId={agent.id} currentUrl={avatarUrl} onUploaded={(url) => setAvatarUrl(url)} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-11 rounded-lg bg-background border-border" />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Tenant</Label>
              <Select value={watch("tenant_id") || agent.tenant_id} onValueChange={(v) => setValue("tenant_id", v)}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeTenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Descrição</Label>
            <Input {...register("description")} className="h-11 rounded-lg bg-background border-border" />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Status</Label>
            <Select value={watch("status") || agent.status} onValueChange={(v) => setValue("status", v)}>
              <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Provider & Model */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Modelo de IA</h3>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Provider</Label>
              <Select defaultValue={agent.provider_id ?? undefined} onValueChange={(v) => {
                setValue("provider_id", v);
                const prov = (providers ?? []).find((p) => p.id === v);
                const models = getModelsForProvider(prov?.name);
                if (models.length > 0) setValue("model", models[0].value);
              }}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  {(providers ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              {(() => {
                const selectedProviderId = watch("provider_id") || agent.provider_id;
                const selectedProvider = (providers ?? []).find((p) => p.id === selectedProviderId);
                const models = getModelsForProvider(selectedProvider?.name);
                if (models.length === 0) {
                  return (
                    <>
                      <Label className="text-sm font-medium text-muted-foreground">Modelo</Label>
                      <Input {...register("model")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
                    </>
                  );
                }
                return (
                  <>
                    <Label className="text-sm font-medium text-muted-foreground">Modelo</Label>
                    <Select defaultValue={agent.model ?? models[0].value} onValueChange={(v) => setValue("model", v)}>
                      <SelectTrigger className="h-11 rounded-lg bg-background border-border font-mono text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{m.label}</span>
                              <span className="text-[10px] text-muted-foreground">{m.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                );
              })()}
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">System Prompt</Label>
            <Textarea {...register("system_prompt")} rows={8} className="rounded-lg bg-background border-border text-sm resize-none" />
          </div>
        </div>

        {/* LLM Params */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Parâmetros de Geração</h3>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Temperature</Label>
                <span className="font-mono text-sm text-primary">{temp.toFixed(2)}</span>
              </div>
              <Slider value={[temp]} onValueChange={([v]) => { setTemp(v); setValue("temperature", v); }} min={0} max={2} step={0.05} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Top P</Label>
                <span className="font-mono text-sm text-primary">{topP.toFixed(2)}</span>
              </div>
              <Slider value={[topP]} onValueChange={([v]) => { setTopP(v); setValue("top_p", v); }} min={0} max={1} step={0.05} />
              <p className="text-xs text-muted-foreground">Limita palavras improváveis (0.8 = focado)</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Top K</Label>
                <span className="font-mono text-sm text-primary">{topK}</span>
              </div>
              <Slider value={[topK]} onValueChange={([v]) => { setTopK(v); setValue("top_k", v); }} min={1} max={100} step={1} />
              <p className="text-xs text-muted-foreground">Vocabulário considerado (40 = rico mas focado)</p>
            </div>
          </div>
        </div>

        {/* Delays */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">⏱ Delays de Humanização</h3>
          <p className="text-sm text-muted-foreground -mt-2">Tempo em segundos. Variação automática de ±30%.</p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Leitura</Label>
              <Input type="number" min={0} step={0.5} value={readDelay} onChange={(e) => setReadDelay(Number(e.target.value))} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Digitando</Label>
              <Input type="number" min={0} step={0.5} value={typingDelay} onChange={(e) => setTypingDelay(Number(e.target.value))} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Entre blocos</Label>
              <Input type="number" min={0} step={0.5} value={blockGap} onChange={(e) => setBlockGap(Number(e.target.value))} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            </div>
          </div>
        </div>

        {/* Debounce */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">📨 Debounce de Mensagens</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-muted-foreground">Janela de espera (s)</Label>
              <span className="font-mono text-sm text-primary">{debounceMs}s</span>
            </div>
            <Input type="number" min={0} max={30} step={1} value={debounceMs} onChange={(e) => setDebounceMs(Number(e.target.value))} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
            <p className="text-xs text-muted-foreground">
              {debounceMs > 0 ? `Aguarda ${debounceMs}s após a última mensagem para consolidar` : "Desativado — responde cada mensagem individualmente"}
            </p>
          </div>
        </div>

        {/* Chatwoot */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-base font-semibold text-foreground">Integração Chatwoot</h3>
          <ChatwootConfigSection
            chatwootUrl={chatwootUrl} setChatwootUrl={setChatwootUrl}
            chatwootApiToken={chatwootApiToken} setChatwootApiToken={setChatwootApiToken}
            chatwootAccountId={chatwootAccountId} setChatwootAccountId={setChatwootAccountId}
            webhookUrl={`${WEBHOOK_BASE}?agent_id=${agent.id}`}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <Button type="button" variant="outline" className="h-11 rounded-lg px-8" onClick={() => navigate("/agents")}>
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
