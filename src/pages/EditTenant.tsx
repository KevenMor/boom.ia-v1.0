import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Building2, Save, Loader2, Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTenants, useUpdateTenant } from "@/hooks/useTenants";
import { useProviders } from "@/hooks/useProviders";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string(),
  status: z.string(),
  sync_url: z.string().optional(),
  dispatcher_provider_id: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function TenantLogoUpload({ tenantId, currentUrl, onUploaded }: { tenantId: string; currentUrl: string | null; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 2MB"); return; }

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${tenantId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("agent-avatars").upload(`tenants/${path}`, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("agent-avatars").getPublicUrl(`tenants/${path}`);
      onUploaded(`${data.publicUrl}?t=${Date.now()}`);
      toast.success("Logo atualizado!");
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message ?? ""));
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = preview || currentUrl;

  return (
    <div
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-lg bg-gradient-to-br from-card to-muted/40 border border-border transition-all hover:ring-2 hover:ring-primary/30"
      )}
      onClick={() => inputRef.current?.click()}
    >
      {displayUrl ? (
        <div className="flex items-center justify-center p-5">
          <img src={displayUrl} alt="Logo da empresa" className="max-h-20 w-auto object-contain" />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-muted-foreground">
          <ImagePlus className="h-6 w-6" />
          <span className="text-[11px]">Clique para adicionar logo da empresa</span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

export default function EditTenant() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const updateTenant = useUpdateTenant();
  const { data: tenants, isLoading } = useTenants();
  const { data: providers } = useProviders();

  const tenant = tenants?.find((t) => t.id === tenantId) ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (tenant) {
      const settings = tenant.settings || {};
      setLogoUrl((settings as any).logo_url || null);
      reset({
        name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status,
        sync_url: (settings as any).sync_url || "",
        dispatcher_provider_id: (settings as any).dispatcher_provider_id || "",
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
        logo_url: logoUrl || undefined,
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

          <TenantLogoUpload tenantId={tenant.id} currentUrl={logoUrl} onUploaded={setLogoUrl} />

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
