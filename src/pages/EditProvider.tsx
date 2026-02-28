import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { ArrowLeft, Cpu, Save, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviders, useUpdateProvider } from "@/hooks/useProviders";
import { toast } from "sonner";
import type { Provider } from "@/types/database";

const schema = z.object({
  name: z.string().min(2),
  base_url: z.string().optional(),
  api_key: z.string().optional(),
  model_default: z.string().optional(),
  status: z.string(),
});

type FormData = z.infer<typeof schema>;

export default function EditProvider() {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const update = useUpdateProvider();
  const { data: providers, isLoading } = useProviders();
  const [showKey, setShowKey] = useState(false);

  const provider = providers?.find((p) => p.id === providerId) ?? null;

  const { register, handleSubmit, setValue, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (provider) {
      reset({
        name: provider.name, base_url: provider.base_url ?? "",
        api_key: "", model_default: provider.model_default ?? "", status: provider.status,
      });
      setShowKey(false);
    }
  }, [provider, reset]);

  const onSubmit = async (data: FormData) => {
    if (!provider) return;
    try {
      await update.mutateAsync({
        id: provider.id, name: data.name, base_url: data.base_url || null,
        raw_api_key: data.api_key || undefined, model_default: data.model_default || null, status: data.status,
      });
      toast.success("Provider atualizado");
      navigate("/providers");
    } catch (err: any) { toast.error("Erro: " + (err.message ?? "desconhecido")); }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Cpu className="mb-4 h-12 w-12" />
        <p>Provider não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/providers")}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate("/providers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-foreground">Editar Provider</h1>
          <p className="text-sm text-muted-foreground">Configure o provedor de modelo de IA</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Informações do Provider</h3>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
              <Input {...register("name")} className="h-11 rounded-lg bg-background border-border" />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">Status</Label>
              <Select defaultValue={provider.status} onValueChange={(v) => setValue("status", v)}>
                <SelectTrigger className="h-11 rounded-lg bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="degraded">Degradado</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Base URL</Label>
            <Input {...register("base_url")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">Modelo Padrão</Label>
            <Input {...register("model_default")} className="h-11 rounded-lg bg-background border-border font-mono text-sm" />
          </div>
        </div>

        {/* API Key */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-base font-semibold text-foreground">Autenticação</h3>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground">API Key</Label>
            <div className="relative">
              <Input
                {...register("api_key")}
                type={showKey ? "text" : "password"}
                placeholder={provider.api_key_encrypted ? "••••• (deixe vazio para manter)" : "sk-..."}
                className="h-11 rounded-lg bg-background border-border font-mono text-sm pr-12"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-9 w-9"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">A chave é criptografada antes de ser salva. Deixe vazio para manter a chave atual.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <Button type="button" variant="outline" className="h-11 rounded-lg px-8" onClick={() => navigate("/providers")}>
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
