import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Building2, Save, Loader2, Camera, ImagePlus, Trash2 } from "lucide-react";
import { useTokensByProvider } from "@/hooks/useTokensByProvider";
import { ProviderTokensCard } from "@/components/dashboard/ProviderTokensCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenants, useUpdateTenant } from "@/hooks/useTenants";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import type { ModuleGroup, ModuleKey } from "@/lib/tenant-modules";
import { TENANT_MODULES, createDefaultModuleState } from "@/lib/tenant-modules";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TenantMembership } from "@/types/database";

const schema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  plan: z.string(),
  status: z.string(),
  sync_url: z.string().optional(),
  prompt_caching_enabled: z.boolean(),
});

type FormData = z.infer<typeof schema>;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "erro desconhecido";
}

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
    } catch (err: unknown) {
      toast.error("Erro no upload: " + getErrorMessage(err));
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
  const { data: providerTokens, isLoading: loadingTokens } = useTokensByProvider(tenantId);


  const tenant = tenants?.find((t) => t.id === tenantId) ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [moduleState, setModuleState] = useState<Record<ModuleKey, boolean>>(createDefaultModuleState);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [membershipRows, setMembershipRows] = useState<TenantMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const { data: adminUsers } = useAdminUsers();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedMembershipRole, setSelectedMembershipRole] = useState<"tenant_admin" | "tenant_user">("tenant_user");

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { prompt_caching_enabled: false },
  });

  const promptCachingEnabled = watch("prompt_caching_enabled");

  useEffect(() => {
    if (tenant) {
      const settings = (tenant.settings || {}) as Record<string, unknown>;
      setLogoUrl(typeof settings.logo_url === "string" ? settings.logo_url : null);
      reset({
        name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status,
        sync_url: typeof settings.sync_url === "string" ? settings.sync_url : "",
        prompt_caching_enabled: Boolean(settings.prompt_caching_enabled),
      });
    }
  }, [tenant, reset]);

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    setModulesLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("tenant_modules")
        .select("module_key, enabled")
        .eq("tenant_id", tenant.id);

      if (cancelled) return;
      if (error) {
        toast.error("Erro ao carregar módulos do tenant.");
        setModuleState(createDefaultModuleState());
        setModulesLoading(false);
        return;
      }

      const defaults = createDefaultModuleState();
      for (const row of data ?? []) {
        const key = String((row as { module_key?: string }).module_key ?? "") as ModuleKey;
        if (key in defaults) {
          defaults[key] = (row as { enabled?: boolean }).enabled !== false;
        }
      }
      setModuleState(defaults);
      setModulesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    setMembershipsLoading(true);
    void (async () => {
      const { data: membershipsData, error: membershipsError } = await supabase
        .from("tenant_memberships")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (membershipsError) {
        toast.error("Erro ao carregar membros do tenant.");
        setMembershipRows([]);
      } else {
        setMembershipRows((membershipsData as TenantMembership[]) ?? []);
      }
      setMembershipsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  const groupedModules = TENANT_MODULES.reduce<Record<ModuleGroup, typeof TENANT_MODULES>>(
    (acc, module) => {
      acc[module.group].push(module);
      return acc;
    },
    { overview: [], infrastructure: [], system: [] }
  );

  const groupTitles: Record<ModuleGroup, string> = {
    overview: "Visão geral",
    infrastructure: "Infraestrutura",
    system: "Sistema",
  };

  const onSubmit = async (data: FormData) => {
    if (!tenant) return;
    try {
      const currentSettings = (tenant.settings || {}) as Record<string, unknown>;
      const newSettings = {
        ...currentSettings,
        sync_url: data.sync_url || undefined,
        logo_url: logoUrl || undefined,
        prompt_caching_enabled: data.prompt_caching_enabled,
      };
      await updateTenant.mutateAsync({
        id: tenant.id, name: data.name, slug: data.slug, plan: data.plan, status: data.status, settings: newSettings,
      });
      const modulePayload = TENANT_MODULES.map((module) => ({
        tenant_id: tenant.id,
        module_key: module.key,
        enabled: moduleState[module.key] !== false,
      }));
      const { error: moduleError } = await supabase
        .from("tenant_modules")
        .upsert(modulePayload, { onConflict: "tenant_id,module_key" });
      if (moduleError) throw moduleError;

      toast.success(`Tenant "${data.name}" atualizado`);
      navigate("/tenants");
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + getErrorMessage(err));
    }
  };

  const addMembership = async () => {
    if (!tenant || !selectedUserId) {
      toast.error("Selecione um usuário para vincular.");
      return;
    }
    const { error } = await supabase
      .from("tenant_memberships")
      .upsert(
        {
          tenant_id: tenant.id,
          user_id: selectedUserId,
          role: selectedMembershipRole,
        },
        { onConflict: "tenant_id,user_id" }
      )
      .select()
      .single();
    if (error) {
      toast.error("Erro ao vincular usuário: " + getErrorMessage(error));
      return;
    }
    const { data } = await supabase
      .from("tenant_memberships")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    setMembershipRows((data as TenantMembership[]) ?? []);
    setSelectedUserId("");
    toast.success("Usuário vinculado ao tenant.");
  };

  const removeMembership = async (membershipId: string) => {
    const { error } = await supabase.from("tenant_memberships").delete().eq("id", membershipId);
    if (error) {
      toast.error("Erro ao remover vínculo: " + getErrorMessage(error));
      return;
    }
    setMembershipRows((prev) => prev.filter((row) => row.id !== membershipId));
    toast.success("Vínculo removido.");
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

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Otimizar prompt para cache</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Reduz custo de tokens de input (OpenAI/Gemini). Prefixo estável = mais cache hits.</p>
            </div>
            <Switch
              checked={promptCachingEnabled}
              onCheckedChange={(v) => setValue("prompt_caching_enabled", v)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Membros do tenant</h3>
            <p className="text-sm text-muted-foreground">
              Vincule usuários e defina perfil de acesso (`tenant_admin` ou `tenant_user`).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="h-11 rounded-lg bg-background border-border md:col-span-2">
                <SelectValue placeholder="Selecione um usuário" />
              </SelectTrigger>
              <SelectContent>
                {(adminUsers ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name
                      ? `${u.full_name}${u.email ? ` — ${u.email}` : ""}`
                      : (u.email ?? u.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Select
                value={selectedMembershipRole}
                onValueChange={(value: "tenant_admin" | "tenant_user") => setSelectedMembershipRole(value)}
              >
                <SelectTrigger className="h-11 rounded-lg bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_admin">tenant_admin</SelectItem>
                  <SelectItem value="tenant_user">tenant_user</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={addMembership}>Adicionar</Button>
            </div>
          </div>

          {membershipsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : membershipRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário vinculado a este tenant.</p>
          ) : (
            <div className="space-y-2">
              {membershipRows.map((membership) => {
                const user = (adminUsers ?? []).find((u) => u.id === membership.user_id);
                const displayName = user?.full_name || user?.email || membership.user_id;
                const displaySub = user?.full_name && user?.email ? user.email : null;
                return (
                  <div
                    key={membership.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{displayName}</p>
                      {displaySub && (
                        <p className="text-xs text-muted-foreground">{displaySub}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{membership.role}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMembership(membership.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Módulos habilitados</h3>
            <p className="text-sm text-muted-foreground">
              Defina quais menus e páginas ficam disponíveis para este tenant.
            </p>
          </div>

          {modulesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            (Object.keys(groupedModules) as ModuleGroup[]).map((group) => (
              <div key={group} className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground">{groupTitles[group]}</h4>
                <div className="space-y-2">
                  {groupedModules[group].map((module) => (
                    <div
                      key={module.key}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{module.label}</p>
                        <p className="text-xs text-muted-foreground">{module.description}</p>
                      </div>
                      <Switch
                        checked={moduleState[module.key]}
                        onCheckedChange={(checked) =>
                          setModuleState((prev) => ({ ...prev, [module.key]: checked }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
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

      {/* Token Usage by Provider */}
      <ProviderTokensCard
        data={providerTokens ?? []}
        loading={loadingTokens}
        title="Consumo de Tokens"
        subtitle={`por provedor — ${tenant.name}`}
      />
    </div>
  );
}
