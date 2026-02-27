import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "lucide-react";
import { z } from "zod";
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useUpdateAgent } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useProviders } from "@/hooks/useProviders";
import { toast } from "sonner";
import { getModelsForProvider } from "@/lib/provider-models";
import { ChatwootConfigSection } from "@/components/agents/ChatwootConfigSection";
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

interface Props { agent: Agent | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function EditAgentDialog({ agent, open, onOpenChange }: Props) {
  const update = useUpdateAgent();
  const { data: tenants } = useTenants();
  const { data: providers } = useProviders();
  const [temp, setTemp] = useState(0.7);
  const [topP, setTopP] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [readDelay, setReadDelay] = useState(1500);
  const [typingDelay, setTypingDelay] = useState(800);
  const [blockGap, setBlockGap] = useState(1200);
  const [chatwootUrl, setChatwootUrl] = useState("");
  const [chatwootApiToken, setChatwootApiToken] = useState("");
  const [chatwootAccountId, setChatwootAccountId] = useState("");
  const { register, handleSubmit, setValue, watch, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (agent) {
      const cfg = agent.config || {};
      reset({
        name: agent.name,
        description: agent.description ?? "",
        tenant_id: agent.tenant_id,
        provider_id: agent.provider_id ?? "",
        model: agent.model ?? "",
        system_prompt: agent.system_prompt ?? "",
        temperature: agent.temperature,
        top_p: (cfg as any).top_p ?? 0.8,
        top_k: (cfg as any).top_k ?? 40,
        status: agent.status,
      });
      setTemp(agent.temperature);
      setTopP((cfg as any).top_p ?? 0.8);
      setTopK((cfg as any).top_k ?? 40);
      setReadDelay(((cfg as any).read_delay_ms ?? 1500) / 1000);
      setTypingDelay(((cfg as any).typing_delay_ms ?? 800) / 1000);
      setBlockGap(((cfg as any).block_gap_ms ?? 1200) / 1000);
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
        id: agent.id,
        ...rest,
        description: rest.description || null,
        provider_id: rest.provider_id || null,
        model: rest.model || null,
        system_prompt: rest.system_prompt || null,
        config: {
          ...currentConfig,
          top_p,
          top_k,
          read_delay_ms: Math.round(readDelay * 1000),
          typing_delay_ms: Math.round(typingDelay * 1000),
          block_gap_ms: Math.round(blockGap * 1000),
          chatwoot_url: chatwootUrl || undefined,
          chatwoot_api_token: chatwootApiToken || undefined,
          chatwoot_account_id: chatwootAccountId || undefined,
        },
      });
      toast.success("Agente atualizado");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? ""));
    }
  };

  const activeTenants = (tenants ?? []).filter((t) => t.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Agente</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-9 bg-background" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tenant</Label>
              <Select value={agent?.tenant_id} onValueChange={(v) => setValue("tenant_id", v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeTenants.map((t) => (
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

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</Label>
            <Select defaultValue={agent?.provider_id ?? undefined} onValueChange={(v) => {
              setValue("provider_id", v);
              const prov = (providers ?? []).find((p) => p.id === v);
              const models = getModelsForProvider(prov?.name);
              if (models.length > 0) setValue("model", models[0].value);
            }}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                {(providers ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const selectedProviderId = watch("provider_id") || agent?.provider_id;
            const selectedProvider = (providers ?? []).find((p) => p.id === selectedProviderId);
            const models = getModelsForProvider(selectedProvider?.name);
            if (models.length === 0) {
              return (
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo</Label>
                  <Input {...register("model")} className="h-9 bg-background font-mono text-sm" />
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo</Label>
                <Select defaultValue={agent?.model ?? models[0].value} onValueChange={(v) => setValue("model", v)}>
                  <SelectTrigger className="h-9 bg-background font-mono text-sm"><SelectValue /></SelectTrigger>
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
              </div>
            );
          })()}

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System Prompt</Label>
            <Textarea {...register("system_prompt")} rows={4} className="bg-background text-sm resize-none" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Temperature</Label>
              <span className="font-mono text-xs text-primary">{temp.toFixed(2)}</span>
            </div>
            <Slider value={[temp]} onValueChange={([v]) => { setTemp(v); setValue("temperature", v); }} min={0} max={2} step={0.05} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top P</Label>
              <span className="font-mono text-xs text-primary">{topP.toFixed(2)}</span>
            </div>
            <Slider value={[topP]} onValueChange={([v]) => { setTopP(v); setValue("top_p", v); }} min={0} max={1} step={0.05} />
            <p className="text-[10px] text-muted-foreground">Limita palavras improváveis (0.8 = focado)</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top K</Label>
              <span className="font-mono text-xs text-primary">{topK}</span>
            </div>
            <Slider value={[topK]} onValueChange={([v]) => { setTopK(v); setValue("top_k", v); }} min={1} max={100} step={1} />
            <p className="text-[10px] text-muted-foreground">Vocabulário considerado (40 = rico mas focado)</p>
          </div>

          <div className="space-y-3 rounded-lg border border-border/50 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">⏱ Delays de Humanização (s)</p>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Leitura</Label>
                <Input type="number" min={0} step={0.5} value={readDelay} onChange={(e) => setReadDelay(Number(e.target.value))} className="h-8 bg-background font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Digitando</Label>
                <Input type="number" min={0} step={0.5} value={typingDelay} onChange={(e) => setTypingDelay(Number(e.target.value))} className="h-8 bg-background font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Entre blocos</Label>
                <Input type="number" min={0} step={0.5} value={blockGap} onChange={(e) => setBlockGap(Number(e.target.value))} className="h-8 bg-background font-mono text-xs" />
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">Variação automática de ±30% aplicada para simular comportamento humano</p>
          </div>

          <ChatwootConfigSection
            chatwootUrl={chatwootUrl}
            setChatwootUrl={setChatwootUrl}
            chatwootApiToken={chatwootApiToken}
            setChatwootApiToken={setChatwootApiToken}
            chatwootAccountId={chatwootAccountId}
            setChatwootAccountId={setChatwootAccountId}
            webhookUrl={agent ? `${WEBHOOK_BASE}?agent_id=${agent.id}` : undefined}
          />

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select defaultValue={agent?.status} onValueChange={(v) => setValue("status", v)}>
              <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={update.isPending}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
