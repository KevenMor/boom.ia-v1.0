import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useUpdateTenant } from "@/hooks/useTenants";
import { toast } from "sonner";
import type { Tenant } from "@/types/database";
import { useEffect } from "react";
import { Slider } from "@/components/ui/slider";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z
    .string()
    .min(2, "Slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string(),
  status: z.string(),
  sync_url: z.string().optional(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  top_k: z.number().min(1).max(100),
});

type FormData = z.infer<typeof schema>;

interface EditTenantDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTenantDialog({ tenant, open, onOpenChange }: EditTenantDialogProps) {
  const updateTenant = useUpdateTenant();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      temperature: 0.5,
      top_p: 0.8,
      top_k: 40,
    },
  });

  const temperature = watch("temperature");
  const topP = watch("top_p");
  const topK = watch("top_k");

  useEffect(() => {
    if (tenant) {
      const settings = tenant.settings || {};
      const llm = (settings as any).llm_config || {};
      reset({
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        sync_url: (settings as any).sync_url || "",
        temperature: llm.temperature ?? 0.5,
        top_p: llm.top_p ?? 0.8,
        top_k: llm.top_k ?? 40,
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
        llm_config: {
          temperature: data.temperature,
          top_p: data.top_p,
          top_k: data.top_k,
        },
      };

      await updateTenant.mutateAsync({
        id: tenant.id,
        name: data.name,
        slug: data.slug,
        plan: data.plan,
        status: data.status,
        settings: newSettings,
      });
      toast.success(`Tenant "${data.name}" atualizado`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + (err.message ?? "erro desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Tenant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input {...register("name")} className="h-9 bg-background" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Slug</Label>
            <Input {...register("slug")} className="h-9 bg-background font-mono text-sm" />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plano</Label>
              <Select defaultValue={tenant?.plan} onValueChange={(v) => setValue("plan", v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select defaultValue={tenant?.status} onValueChange={(v) => setValue("status", v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="provisioning">Provisionando</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">URL de Sync (Inventário)</Label>
            <Input {...register("sync_url")} placeholder="https://exemplo.com.br/Veiculos" className="h-9 bg-background text-sm" />
          </div>

          <Separator />

          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Configuração LLM</h4>
            <p className="text-xs text-muted-foreground">Parâmetros de geração para os agentes deste tenant</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Temperature</Label>
                <span className="text-xs font-mono text-muted-foreground">{temperature}</span>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setValue("temperature", v)}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">Criatividade das respostas (0 = determinístico, 2 = muito criativo)</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top P</Label>
                <span className="text-xs font-mono text-muted-foreground">{topP}</span>
              </div>
              <Slider
                value={[topP]}
                onValueChange={([v]) => setValue("top_p", v)}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">Limita palavras improváveis (0.8 = focado, 1.0 = sem limite)</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top K</Label>
                <span className="text-xs font-mono text-muted-foreground">{topK}</span>
              </div>
              <Slider
                value={[topK]}
                onValueChange={([v]) => setValue("top_k", v)}
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">Vocabulário considerado (40 = rico mas focado)</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateTenant.isPending} className="gap-2">
              {updateTenant.isPending && (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
