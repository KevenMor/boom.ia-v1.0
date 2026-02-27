import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useCreateAgent } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useProviders } from "@/hooks/useProviders";
import { toast } from "sonner";
import { useState } from "react";
import { getModelsForProvider } from "@/lib/provider-models";

const schema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  description: z.string().optional(),
  tenant_id: z.string().min(1, "Selecione um tenant"),
  provider_id: z.string().optional(),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(0.8),
  top_k: z.number().min(1).max(100).default(40),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTenantId?: string;
}

export function CreateAgentDialog({ open, onOpenChange, defaultTenantId }: Props) {
  const create = useCreateAgent();
  const { data: tenants } = useTenants();
  const { data: providers } = useProviders();
  const [temp, setTemp] = useState(0.7);
  const [topP, setTopP] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [readDelay, setReadDelay] = useState(1500);
  const [typingDelay, setTypingDelay] = useState(800);
  const [blockGap, setBlockGap] = useState(1200);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", tenant_id: defaultTenantId ?? "", provider_id: "", model: "", system_prompt: "", temperature: 0.7, top_p: 0.8, top_k: 40 },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await create.mutateAsync({
        name: data.name,
        description: data.description || null,
        tenant_id: data.tenant_id,
        provider_id: data.provider_id || null,
        model: data.model || null,
        system_prompt: data.system_prompt || null,
        temperature: data.temperature,
        config: { top_p: data.top_p, top_k: data.top_k, read_delay_ms: readDelay, typing_delay_ms: typingDelay, block_gap_ms: blockGap },
      });
      toast.success(`Agente "${data.name}" criado`);
      reset();
      setTemp(0.7);
      setTopP(0.8);
      setTopK(40);
      setReadDelay(1500);
      setTypingDelay(800);
      setBlockGap(1200);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message ?? "desconhecido"));
    }
  };

  const activeTenants = (tenants ?? []).filter((t) => t.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Agente</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
              <Input {...register("name")} placeholder="Atendente Virtual" className="h-9 bg-background" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tenant</Label>
              <Select defaultValue={defaultTenantId} onValueChange={(v) => setValue("tenant_id", v)}>
                <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tenant_id && <p className="text-xs text-destructive">{errors.tenant_id.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Input {...register("description")} placeholder="Agente de atendimento ao cliente" className="h-9 bg-background" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Provider</Label>
            <Select onValueChange={(v) => {
              setValue("provider_id", v);
              const prov = (providers ?? []).find((p) => p.id === v);
              const models = getModelsForProvider(prov?.name);
              if (models.length > 0) setValue("model", models[0].value);
            }}>
              <SelectTrigger className="h-9 bg-background"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {(providers ?? []).filter((p) => p.status === "active").map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const selectedProvider = (providers ?? []).find((p) => p.id === watch("provider_id"));
            const models = getModelsForProvider(selectedProvider?.name);
            if (models.length === 0) {
              return (
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo</Label>
                  <Input {...register("model")} placeholder="nome-do-modelo" className="h-9 bg-background font-mono text-sm" />
                </div>
              );
            }
            return (
              <div className="space-y-2">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Modelo</Label>
                <Select onValueChange={(v) => setValue("model", v)} defaultValue={models[0].value}>
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
            <Textarea
              {...register("system_prompt")}
              placeholder="Você é um assistente virtual da empresa X. Responda de forma clara e objetiva..."
              rows={4}
              className="bg-background text-sm resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Temperature</Label>
              <span className="font-mono text-xs text-primary">{temp.toFixed(2)}</span>
            </div>
            <Slider
              value={[temp]}
              onValueChange={([v]) => { setTemp(v); setValue("temperature", v); }}
              min={0}
              max={2}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
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
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">⏱ Delays de Humanização</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Leitura (antes de responder)</Label>
                <span className="font-mono text-xs text-primary">{(readDelay / 1000).toFixed(1)}s</span>
              </div>
              <Slider value={[readDelay]} onValueChange={([v]) => setReadDelay(v)} min={0} max={5000} step={100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Digitando (antes de cada bloco)</Label>
                <span className="font-mono text-xs text-primary">{(typingDelay / 1000).toFixed(1)}s</span>
              </div>
              <Slider value={[typingDelay]} onValueChange={([v]) => setTypingDelay(v)} min={0} max={3000} step={100} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Intervalo entre blocos</Label>
                <span className="font-mono text-xs text-primary">{(blockGap / 1000).toFixed(1)}s</span>
              </div>
              <Slider value={[blockGap]} onValueChange={([v]) => setBlockGap(v)} min={0} max={5000} step={100} />
            </div>

            <p className="text-[10px] text-muted-foreground">Variação automática de ±30% aplicada para simular comportamento humano</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar Agente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
