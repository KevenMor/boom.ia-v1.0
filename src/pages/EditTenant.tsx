import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { ArrowLeft, Building2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTenants, useUpdateTenant } from "@/hooks/useTenants";
import { useProviders } from "@/hooks/useProviders";
import { toast } from "sonner";
import type { Tenant } from "@/types/database";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string(),
  status: z.string(),
  sync_url: z.string().optional(),
  dispatcher_provider_id: z.string().optional(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  top_k: z.number().min(1).max(100),
});

type FormData = z.infer<typeof schema>;

export default function EditTenant() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const updateTenant = useUpdateTenant();
  const { data: tenants, isLoading } = useTenants();
  const { data: providers } = useProviders();

  const tenant = tenants?.find((t) => t.id === tenantId) ?? null;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { temperature: 0.5, top_p: 0.8, top_k: 40 },
  });

  const temperature = watch("temperature");
  const topP = watch("top_p");
  const topK = watch("top_k");

  useEffect(() => {
    if (tenant) {
      const settings = tenant.settings || {};
      const llm = (settings as any).llm_config || {};
      reset({
        name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status,
        sync_url: (settings as any).sync_url || "",
        dispatcher_provider_id: (settings as any).dispatcher_provider_id || "",
        temperature: llm.temperature ?? 0.5, top_p: llm.top_p ?? 0.8, top_k: llm.top_k ?? 40,
      });
    }
  }, [tenant, reset]);

  const onSubmit = async (data: FormData) => {
    if (!tenant) return;
    try {
      const currentSettings = (tenant.settings || {}) as Record<string, unknown>;
      const newSettings = {
        ...currentSettings,
        sync_url: data.sync_url || undefined,
        dispatcher_provider_id: data.dispatcher_provider_id || undefined,
        llm_config: { temperature: data.temperature, top_p: data.top_p, top_k: data.top_k },
      };
      await updateTenant.mutateAsync({
        id: tenant.id, name: data.name, slug: data.slug, plan: data.plan, status: data.status, settings: newSettings,
      });
      toast.success(`Tenant "${data.name}" atualizado`);
      navigate("/tenants");
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err.message ?? "erro desconhecido"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Building2 className="mb-4 h-12 w-12" />
        <p>Tenant não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/tenants")}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/tenants")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Editar Tenant</h1>
          <p className="text-sm text-muted-foreground">Atualize os dados e configurações da empresa</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Informações Básicas</h3>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-11 rounded-lg bg-background border-border" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Slug</Label>
              <Input {...register("slug")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Plano</Label>
              <Select value={watch("plan") || tenant.plan} onValueChange={(v) => setValue("plan", v)}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Status</Label>
              <Select value={watch("status") || tenant.status} onValueChange={(v) => setValue("status", v)}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="provisioning">Provisionando</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">URL de Sync (Inventário)</Label>
            <Input {...register("sync_url")} placeholder="https://exemplo.com.br/Veiculos" className="h-11 rounded-lg bg-background border-border text-sm" />
          </div>
        </div>

        {/* Dispatcher */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-foreground">Tool Dispatcher</h3>
            <Badge variant="secondary" className="text-[10px]">Fase 1</Badge>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">Provider usado para decidir quando acionar ferramentas</p>

          <Select
            value={watch("dispatcher_provider_id") || ""}
            onValueChange={(v) => setValue("dispatcher_provider_id", v === "_none" ? "" : v)}
          >
            <SelectTrigger className="h-11 rounded-lg bg-background border-border">
              <SelectValue placeholder="Nenhum (desabilitado)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum (desabilitado)</SelectItem>
              {(providers ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} {p.model_default ? `(${p.model_default})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* LLM Config */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Configuração LLM</h3>
          <p className="text-sm text-muted-foreground -mt-2">Parâmetros de geração para os agentes deste tenant</p>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Temperature</Label>
                <span className="text-sm font-mono text-primary">{temperature}</span>
              </div>
              <Slider value={[temperature]} onValueChange={([v]) => setValue("temperature", v)} min={0} max={2} step={0.1} />
              <p className="text-xs text-muted-foreground">Criatividade das respostas (0 = determinístico, 2 = muito criativo)</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Top P</Label>
                <span className="text-sm font-mono text-primary">{topP}</span>
              </div>
              <Slider value={[topP]} onValueChange={([v]) => setValue("top_p", v)} min={0} max={1} step={0.05} />
              <p className="text-xs text-muted-foreground">Limita palavras improváveis (0.8 = focado, 1.0 = sem limite)</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">Top K</Label>
                <span className="text-sm font-mono text-primary">{topK}</span>
              </div>
              <Slider value={[topK]} onValueChange={([v]) => setValue("top_k", v)} min={1} max={100} step={1} />
              <p className="text-xs text-muted-foreground">Vocabulário considerado (40 = rico mas focado)</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <Button type="button" variant="outline" className="h-11 rounded-lg px-8" onClick={() => navigate("/tenants")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={updateTenant.isPending} className="h-11 rounded-lg px-8 gap-2">
            {updateTenant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
