import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Save,
  Loader2,
  Wrench,
  Plus,
  X,
  Link2,
  Copy,
  Maximize2,
  ChevronDown,
  User,
  Brain,
  Plug,
  Clock,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAgents, useUpdateAgent } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { useProviders } from "@/hooks/useProviders";
import { useTools } from "@/hooks/useTools";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getModelsForProvider } from "@/lib/provider-models";
import { getApiBase, callAPI } from "@/lib/api-client";
import { ChatwootConfigSection } from "@/components/agents/ChatwootConfigSection";
import { FollowUpConfigSection } from "@/components/agents/FollowUpConfigSection";
import { AgentAvatarUpload } from "@/components/agents/AgentAvatarUpload";
import { ReminderConfigSection } from "@/components/agents/ReminderConfigSection";
import { BusinessHoursSection, DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@/components/agents/BusinessHoursSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
const WEBHOOK_BASE = `${getApiBase()}/webhooks`;

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

interface AdminPromptDetail {
  slug: string;
  version?: string;
  description?: string;
  systemPrompt?: string;
  fullComposedPrompt?: string;
  fullPromptLength?: number;
}

type EditAgentTab = "basic" | "model" | "integration" | "schedule" | "advanced";

const fld =
  "w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 dark:bg-card";

const stitchCard =
  "rounded-lg border border-border bg-card p-4 sm:p-6 max-sm:border-0 max-sm:bg-transparent max-sm:p-0";

const stitchLbl = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const stitchSection =
  "box-border w-full min-w-0 max-w-full overflow-x-hidden rounded-lg border border-border bg-card p-4 sm:p-6";

const stitchSectionTitle =
  "text-base font-semibold text-foreground";

/** Sliders com alvo de toque maior no mobile (px evita thumb cortar a borda do card) */
const sliderTouch =
  "box-border w-full min-w-0 max-w-full touch-pan-y py-2 sm:py-1.5 [&>span.block]:h-5 [&>span.block]:w-5 [&>span.block]:shadow-sm sm:[&>span.block]:h-4 sm:[&>span.block]:w-4 sm:[&>span.block]:shadow-none";

const EDIT_AGENT_STITCH_TABS: { id: EditAgentTab; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Informações Básicas", icon: User },
  { id: "model", label: "Modelo de IA", icon: Brain },
  { id: "integration", label: "Integração", icon: Plug },
  { id: "schedule", label: "Horário e Follow-up", icon: Clock },
  { id: "advanced", label: "Avançados", icon: SlidersHorizontal },
];

/** Mesma coluna para header + conteúdo (evita desalinhamento entre abas e cards) */
const editAgentCol = "mx-auto w-full max-w-[1280px] px-3 sm:px-6 lg:px-8";

export default function EditAgent() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { selectedTenantId } = useTenantContext();
  const update = useUpdateAgent();
  const { data: agents, isLoading } = useAgents();
  const { data: tenants } = useTenants();
  const { data: providers } = useProviders();
  const { data: allTools } = useTools();

  const agent = agents?.find((a) => a.id === agentId) ?? null;

  useEffect(() => {
    if (!isLoading && agent && selectedTenantId && agent.tenant_id !== selectedTenantId) {
      navigate("/agents", { replace: true });
    }
  }, [selectedTenantId, agent, isLoading, navigate]);


  // Fetch linked tool IDs for this agent
  const { data: linkedToolIds, refetch: refetchLinks } = useQuery({
    queryKey: ["agent_tools", agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await nexusDb.from("agent_tools").select("tool_id").eq("agent_id", agentId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.tool_id as string);
    },
    enabled: !!agentId,
  });

  // Tools available for this agent's tenant (or global)
  const availableTools = allTools?.filter((t) =>
    !t.tenant_id || t.tenant_id === agent?.tenant_id
  ) ?? [];

  const linkedTools = availableTools.filter((t) => linkedToolIds?.includes(t.id));
  const unlinkableTools = availableTools.filter((t) => !linkedToolIds?.includes(t.id));

  const linkTool = async (toolId: string) => {
    if (!agentId) return;
    const { error } = await nexusDb.from("agent_tools").insert({ agent_id: agentId, tool_id: toolId });
    if (error) {
      toast.error("Erro ao vincular: " + error.message);
    } else {
      toast.success("Tool vinculada");
      refetchLinks();
    }
  };

  const unlinkTool = async (toolId: string) => {
    if (!agentId) return;
    const { error } = await nexusDb.from("agent_tools").delete().eq("agent_id", agentId).eq("tool_id", toolId);
    if (error) {
      toast.error("Erro ao desvincular: " + error.message);
    } else {
      toast.success("Tool desvinculada");
      refetchLinks();
    }
  };

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [temp, setTemp] = useState(0.7);
  const [topP, setTopP] = useState(0.8);
  const [topK, setTopK] = useState(40);
  const [readDelay, setReadDelay] = useState(1.5);
  const [typingDelay, setTypingDelay] = useState(0.8);
  const [blockGap, setBlockGap] = useState(1.2);
  const [debounceMs, setDebounceMs] = useState(0);
  const [dispatcherPrompt, setDispatcherPrompt] = useState("");
  const [dispatcherProviderId, setDispatcherProviderId] = useState("");
  const [dispatcherModel, setDispatcherModel] = useState("");
  const [welcomeVideoUrl, setWelcomeVideoUrl] = useState("");
  const [welcomeNameQuestion, setWelcomeNameQuestion] = useState("");
  const [chatwootUrl, setChatwootUrl] = useState("");
  const [chatwootApiToken, setChatwootApiToken] = useState("");
  const [chatwootAccountId, setChatwootAccountId] = useState("");
  const [wahaUrl, setWahaUrl] = useState("");
  const [wahaApiKey, setWahaApiKey] = useState("");
  const [wahaSession, setWahaSession] = useState("default");
  const [deliverMediaViaWaha, setDeliverMediaViaWaha] = useState(false);
  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupMaxAttempts, setFollowupMaxAttempts] = useState(3);
  const [followupIntervals, setFollowupIntervals] = useState<number[]>([10, 20, 30]);
  const [followupQuietStart, setFollowupQuietStart] = useState("22:00");
  const [followupQuietEnd, setFollowupQuietEnd] = useState("08:00");
  const [followupPrompt, setFollowupPrompt] = useState("");
  const [followupAgentId, setFollowupAgentId] = useState("");
  const [followupNegativeGuardEnabled, setFollowupNegativeGuardEnabled] = useState(true);
  const [followupThinkingDelayMinutes, setFollowupThinkingDelayMinutes] = useState(2880);
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(false);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [offlineMessage, setOfflineMessage] = useState("");
  const [sandboxPassword, setSandboxPassword] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState(60);
  const [reminderTemplate, setReminderTemplate] = useState("");
  const [testAssigneeId, setTestAssigneeId] = useState("");
  const [agentAssigneeId, setAgentAssigneeId] = useState("");
  const [leadLabelEnabled, setLeadLabelEnabled] = useState(false);
  const [agentTab, setAgentTab] = useState<EditAgentTab>("basic");
  const [promptDlg, setPromptDlg] = useState<"closed" | "production" | "override">("closed");
  const [dbPromptOpen, setDbPromptOpen] = useState(false);

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormData>({ resolver: zodResolver(schema) });

  const tenantIdEffective = watch("tenant_id") || agent?.tenant_id || "";
  const tenantSlugForPrompt = useMemo(() => {
    if (!tenantIdEffective || !tenants?.length) return null;
    return tenants.find((t) => t.id === tenantIdEffective)?.slug?.trim() || null;
  }, [tenantIdEffective, tenants]);

  const { data: promptDetail, isLoading: promptPreviewLoading, isError: promptPreviewIsError } = useQuery({
    queryKey: ["admin_prompt_preview", tenantSlugForPrompt],
    queryFn: () =>
      callAPI<AdminPromptDetail>(`/admin/prompts?slug=${encodeURIComponent(tenantSlugForPrompt!)}`, { method: "GET" }),
    enabled: Boolean(agent && tenantSlugForPrompt),
    staleTime: 60_000,
  });

  const hasRegistryPreview = Boolean(promptDetail?.fullComposedPrompt && promptDetail.fullComposedPrompt.length > 0);

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
      setBlockGap(((cfg as any).block_gap_ms ?? 2000) / 1000);
      setDebounceMs(((cfg as any).message_debounce_ms ?? 3000) / 1000);
      setDispatcherPrompt((cfg as any).dispatcher_prompt ?? "");
      setDispatcherProviderId((cfg as any).dispatcher_provider_id ?? "");
      setDispatcherModel((cfg as any).dispatcher_model ?? "");
      setWelcomeVideoUrl((cfg as any).welcome_video_url ?? "");
      setWelcomeNameQuestion((cfg as any).welcome_name_question ?? "");
      setChatwootUrl((cfg as any).chatwoot_url ?? "");
      setChatwootApiToken((cfg as any).chatwoot_api_token ?? "");
      setChatwootAccountId((cfg as any).chatwoot_account_id ?? "");
      setWahaUrl((cfg as any).waha_url ?? "");
      setWahaApiKey((cfg as any).waha_api_key ?? "");
      setWahaSession((cfg as any).waha_session ?? "default");
      setDeliverMediaViaWaha(Boolean((cfg as any).deliver_media_via_waha));
      setFollowupEnabled((cfg as any).followup_enabled ?? false);
      setFollowupMaxAttempts((cfg as any).followup_max_attempts ?? 3);
      setFollowupIntervals((cfg as any).followup_intervals ?? [10, 20, 30]);
      setFollowupQuietStart((cfg as any).followup_quiet_start ?? "22:00");
      setFollowupQuietEnd((cfg as any).followup_quiet_end ?? "08:00");
      setFollowupPrompt((cfg as any).followup_prompt ?? "");
      setFollowupAgentId((cfg as any).followup_agent_id ?? "");
      setFollowupNegativeGuardEnabled((cfg as any).followup_negative_guard_enabled !== false);
      setFollowupThinkingDelayMinutes((cfg as any).followup_thinking_delay_minutes ?? 2880);
      setBusinessHoursEnabled((cfg as any).business_hours_enabled ?? false);
      setBusinessHours((cfg as any).business_hours ?? DEFAULT_BUSINESS_HOURS);
      setOfflineMessage((cfg as any).business_hours_offline_message ?? "");
      setSandboxPassword((cfg as any).sandbox_password ?? "");
      setReminderEnabled((cfg as any).reminder_enabled ?? false);
      setReminderMinutesBefore((cfg as any).reminder_minutes_before ?? 60);
      setReminderTemplate((cfg as any).reminder_template ?? "");
      setTestAssigneeId(String((cfg as any).test_assignee_id ?? ""));
      setAgentAssigneeId(String((cfg as any).agent_assignee_id ?? ""));
      setLeadLabelEnabled((cfg as any).lead_label_enabled ?? false);
    }
  }, [agent, reset]);

  useEffect(() => {
    if (!agent) return;
    const n = agent.name?.trim();
    document.title = n ? `Editar Agente: ${n} - Boom IA` : "Editar Agente - Boom IA";
    return () => {
      document.title = "Boom IA — Plataforma de Agentes";
    };
  }, [agent]);

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
          dispatcher_prompt: dispatcherPrompt || undefined,
          dispatcher_provider_id: dispatcherProviderId || undefined,
          dispatcher_model: dispatcherModel || undefined,
          welcome_video_url: welcomeVideoUrl || undefined,
          welcome_name_question: welcomeNameQuestion || undefined,
          chatwoot_url: chatwootUrl || undefined, chatwoot_api_token: chatwootApiToken || undefined,
          chatwoot_account_id: chatwootAccountId || undefined,
          waha_url: wahaUrl || undefined, waha_api_key: wahaApiKey || undefined,
          waha_session: wahaSession || "default",
          deliver_media_via_waha: deliverMediaViaWaha,
          followup_enabled: followupEnabled,
          followup_max_attempts: followupIntervals.length,
          followup_intervals: followupIntervals,
          followup_quiet_start: followupQuietStart || undefined,
          followup_quiet_end: followupQuietEnd || undefined,
          followup_prompt: followupPrompt || undefined,
          followup_agent_id: followupAgentId || undefined,
          followup_negative_guard_enabled: followupNegativeGuardEnabled,
          followup_thinking_delay_minutes: followupThinkingDelayMinutes,
          business_hours_enabled: businessHoursEnabled,
          business_hours: businessHours,
          business_hours_offline_message: offlineMessage || undefined,
          sandbox_password: sandboxPassword || undefined,
          reminder_enabled: reminderEnabled,
          reminder_minutes_before: reminderMinutesBefore,
          reminder_template: reminderTemplate || undefined,
          test_assignee_id: testAssigneeId ? Number(testAssigneeId) : undefined,
          agent_assignee_id: agentAssigneeId ? Number(agentAssigneeId) : undefined,
          lead_label_enabled: leadLabelEnabled,
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
      <div className="flex min-h-[50vh] flex-1 flex-col bg-background py-8">
        <div className={cn(editAgentCol, "space-y-6")}>
          <Skeleton className="h-9 max-w-md rounded-lg" />
          <Skeleton className="min-h-[560px] w-full rounded-lg border border-border" />
        </div>
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
    <>
      <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-background">
        <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/95 backdrop-blur-sm dark:bg-card/95">
          <div className={cn(editAgentCol, "flex items-center gap-3 py-3 sm:py-4")}>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground sm:text-lg">
              {watch("name")?.trim() || "Editar Agente"}
            </h2>
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 text-xs font-medium",
                (watch("status") || agent.status) === "active" && "border-success/30 bg-success/10 text-success",
                (watch("status") || agent.status) === "test" && "border-warning/30 bg-warning/10 text-warning",
                (watch("status") || agent.status) === "inactive" && "border-muted-foreground/30 bg-muted text-muted-foreground",
              )}
            >
              {(watch("status") || agent.status) === "active" ? "Ativo" :
               (watch("status") || agent.status) === "test" ? "Teste" : "Inativo"}
            </Badge>
            <Button
              type="submit"
              form="edit-agent-form"
              disabled={update.isPending}
              className="h-9 shrink-0 gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:h-10 sm:gap-2 sm:px-6 sm:text-sm"
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </header>

        <div className="min-w-0 flex-1 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className={cn(editAgentCol, "min-w-0 max-w-full pb-8 pt-4")}>
            <form id="edit-agent-form" onSubmit={handleSubmit(onSubmit)} className="flex min-w-0 gap-6">
              {/* Section sidebar */}
              <aside className="sticky top-[73px] hidden h-fit w-[220px] shrink-0 lg:block">
                <nav className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-2" aria-label="Seções do formulário">
                  {EDIT_AGENT_STITCH_TABS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={agentTab === t.id}
                        onClick={() => setAgentTab(t.id)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          agentTab === t.id
                            ? "bg-foreground/[0.06] text-foreground dark:bg-foreground/10"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {t.label}
                      </button>
                    );
                  })}
                </nav>
              </aside>

              {/* Content area */}
              <div className="min-w-0 flex-1 space-y-5 sm:space-y-8">

              {agentTab === "basic" && (
              <section className="rounded-lg border-0 bg-transparent p-0 sm:border sm:border-border sm:bg-card sm:p-6">
                <h3 className="mb-3 text-base font-semibold text-foreground sm:mb-4">
                  Informações Básicas
                </h3>
                {/* Avatar — compact row on mobile, column on desktop */}
                <div className="mb-6 flex flex-col gap-5 sm:mb-8">
                  <div className="flex justify-center border-b border-border/50 pb-5 sm:justify-start sm:border-0 sm:pb-0">
                    <AgentAvatarUpload
                      agentId={agent.id}
                      currentUrl={avatarUrl}
                      onUploaded={(url) => setAvatarUrl(url)}
                      layout="stitch"
                      stitchSize="compact"
                      className="w-auto"
                    />
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label className={stitchLbl}>Nome do Agente</Label>
                      <Input {...register("name")} className={fld} />
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label className={stitchLbl}>Tenant</Label>
                      <Select value={watch("tenant_id") || agent.tenant_id} onValueChange={(v) => setValue("tenant_id", v)}>
                        <SelectTrigger className={cn(fld, "flex h-9 items-center")}>
                          <SelectValue placeholder="Tenant" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeTenants.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 space-y-5 sm:space-y-6">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className={stitchLbl}>Descrição interna</Label>
                    <Textarea {...register("description")} rows={2} className={cn(fld, "min-h-[72px] resize-y sm:min-h-[88px]")} />
                  </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label className={stitchLbl}>Status</Label>
                      <Select value={watch("status") || agent.status || "inactive"} onValueChange={(v) => setValue("status", v)}>
                        <SelectTrigger className={cn(fld, "flex h-9 items-center")}>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="test">Teste</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(watch("status") || agent.status) === "test" && (
                      <div className="space-y-3 rounded-xl bg-muted p-5 dark:bg-muted">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <Label className="text-sm font-semibold text-foreground">Assignee ID para Teste</Label>
                        </div>
                        <Input
                          type="number"
                          placeholder="ID do atendente no Chatwoot"
                          value={testAssigneeId}
                          onChange={(e) => setTestAssigneeId(e.target.value)}
                          className={cn(fld, "font-mono text-sm")}
                        />
                        <p className="text-xs text-muted-foreground">
                          No status <strong>Teste</strong>, o agente só interage quando a conversa no Chatwoot estiver atribuída a este ID.
                        </p>
                      </div>
                    )}
                    {(watch("status") || agent.status) === "active" && (
                      <div className="space-y-3 rounded-xl bg-muted p-5 dark:bg-muted">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <Label className="text-sm font-semibold text-foreground">Assignee ID do agente (bot)</Label>
                        </div>
                        <Input
                          type="number"
                          placeholder="ID do usuário no Chatwoot que representa o bot"
                          value={agentAssigneeId}
                          onChange={(e) => setAgentAssigneeId(e.target.value)}
                          className={cn(fld, "font-mono text-sm")}
                        />
                        <p className="text-xs text-muted-foreground">
                          Após a primeira mensagem da IA a conversa é atribuída a este ID. Follow-ups só ocorrem com este assignee ou sem assignee.
                        </p>
                      </div>
                    )}
                  </div>
              </section>
            )}

            {agentTab === "model" && (
              <section className={cn(stitchCard, "space-y-6")}>
                <h3 className="text-base font-semibold text-foreground">Configuração do Modelo de IA</h3>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={stitchLbl}>Provedor</Label>
                    <Select defaultValue={agent.provider_id ?? undefined} onValueChange={(v) => {
                      setValue("provider_id", v);
                      const prov = (providers ?? []).find((p) => p.id === v);
                      const models = getModelsForProvider(prov?.name);
                      if (models.length > 0) setValue("model", models[0].value);
                    }}>
                      <SelectTrigger className={cn(fld, "flex h-9 items-center")}>
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        {(providers ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const selectedProviderId = watch("provider_id") || agent.provider_id;
                      const selectedProvider = (providers ?? []).find((p) => p.id === selectedProviderId);
                      const models = getModelsForProvider(selectedProvider?.name);
                      if (models.length === 0) {
                        return (
                          <>
                            <Label className={stitchLbl}>Modelo</Label>
                            <Input {...register("model")} className={cn(fld, "font-mono text-sm")} />
                          </>
                        );
                      }
                      return (
                        <>
                          <Label className={stitchLbl}>Modelo</Label>
                          <Select defaultValue={agent.model ?? models[0].value} onValueChange={(v) => setValue("model", v)}>
                            <SelectTrigger className={cn(fld, "h-auto min-h-[44px] py-2")}>
                              <SelectValue>
                                {(() => {
                                  const currentModel = watch("model") || agent.model;
                                  const found = models.find((m) => m.value === currentModel);
                                  if (!found) return <span className="text-sm">{currentModel}</span>;
                                  return (
                                    <div className="flex flex-col items-start text-left">
                                      <span className="text-sm font-medium">{found.label}</span>
                                      <span className="text-xs text-muted-foreground">{found.description}</span>
                                    </div>
                                  );
                                })()}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {models.map((m) => (
                                <SelectItem key={m.value} value={m.value} className="py-2.5">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{m.label}</span>
                                    <span className="text-xs text-muted-foreground">{m.description}</span>
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

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className={cn(stitchLbl, "!mb-0")}>Prompt em produção</Label>
                      {hasRegistryPreview && promptDetail?.version ? (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {promptDetail.slug} · v{promptDetail.version}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={promptPreviewLoading || (hasRegistryPreview && !promptDetail?.fullComposedPrompt)}
                        className="h-auto gap-1 px-2 text-primary hover:bg-transparent hover:underline disabled:opacity-50 dark:text-primary"
                        onClick={() => setPromptDlg(hasRegistryPreview ? "production" : "override")}
                      >
                        <Maximize2 className="h-4 w-4" /> Expandir
                      </Button>
                      {hasRegistryPreview && promptDetail?.fullComposedPrompt ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto gap-1 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
                          onClick={() => {
                            void navigator.clipboard.writeText(promptDetail.fullComposedPrompt ?? "");
                            toast.success("Prompt copiado.");
                          }}
                        >
                          <Copy className="h-4 w-4" /> Copiar
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {promptPreviewLoading ? <Skeleton className="min-h-[160px] w-full rounded-lg" /> : null}

                  {!promptPreviewLoading && hasRegistryPreview ? (
                    <>
                      <Textarea
                        readOnly
                        rows={10}
                        value={promptDetail?.fullComposedPrompt ?? ""}
                        className={cn(
                          fld,
                          "min-h-[200px] cursor-default resize-y bg-muted/50 font-mono text-sm leading-relaxed text-foreground/80 dark:bg-muted/30 dark:text-foreground",
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        Montado pelo servidor (bloco do tenant + regras globais, idioma e data). É um preview aproximado — no chat pode variar conforme ferramentas e calendário.
                        Código-fonte no painel{" "}
                        <Link className="text-primary underline dark:text-primary" to="/prompts">Prompts</Link>.
                      </p>
                      <p className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                        Este tenant tem prompt no repositório. O motor usa essa base no código — o campo{" "}
                        <code className="rounded bg-black/[0.06] px-1 py-0.5 dark:bg-white/10">system_prompt</code> neste agente
                        não substitui esse texto principal.
                      </p>
                      <Collapsible open={dbPromptOpen} onOpenChange={setDbPromptOpen}>
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="flex h-auto w-full items-center justify-between gap-2 border-dashed py-3 text-left text-sm font-semibold text-foreground dark:border-border dark:text-foreground"
                          >
                            Campo system_prompt no banco (opcional)
                            <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", dbPromptOpen && "rotate-180")} />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 pt-3">
                          <Textarea rows={6} {...register("system_prompt")} className={cn(fld, "resize-y font-mono text-sm")} />
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 text-xs text-primary dark:text-primary"
                              onClick={() => setPromptDlg("override")}
                            >
                              Expandir em janela
                            </Button>
                            <span className="text-[11px] text-muted-foreground">
                              Em uso principalmente quando não há entrada no registry. Pode ficar vazio.
                            </span>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  ) : null}

                  {!promptPreviewLoading && !hasRegistryPreview ? (
                    <>
                      {promptPreviewIsError ? (
                        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          Não foi possível carregar o preview do código
                          {tenantSlugForPrompt ? ` (slug “${tenantSlugForPrompt}”)` : ""}. Verifique permissão ou registry.
                          Abaixo, o texto salvo na linha do agente vale como base quando não há prompt de tenant no servidor.
                        </p>
                      ) : null}
                      {!promptPreviewIsError && !tenantSlugForPrompt ? (
                        <p className="text-xs text-muted-foreground">Defina o tenant para buscar prompt do código pelo slug.</p>
                      ) : null}
                      <Textarea
                        rows={8}
                        {...register("system_prompt")}
                        className={cn(fld, "min-h-[160px] resize-y font-mono text-sm leading-relaxed text-foreground/80 dark:text-foreground")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Prompt base gravado neste agente. Ver também{" "}
                        <Link className="text-primary underline dark:text-primary" to="/prompts">Prompts</Link>.
                      </p>
                    </>
                  ) : null}
                </div>
              </section>
            )}

            {agentTab === "integration" && (
              <>
                <section className={cn(stitchCard, "space-y-4")}>
                  <h3 className="text-base font-semibold text-foreground">Integração Chatwoot &amp; WAHA</h3>
                  <ChatwootConfigSection
                    chatwootUrl={chatwootUrl} setChatwootUrl={setChatwootUrl}
                    chatwootApiToken={chatwootApiToken} setChatwootApiToken={setChatwootApiToken}
                    chatwootAccountId={chatwootAccountId} setChatwootAccountId={setChatwootAccountId}
                    webhookUrl={`${WEBHOOK_BASE}?agent_id=${agent.id}`}
                    wahaUrl={wahaUrl} setWahaUrl={setWahaUrl}
                    wahaApiKey={wahaApiKey} setWahaApiKey={setWahaApiKey}
                    wahaSession={wahaSession} setWahaSession={setWahaSession}
                    deliverMediaViaWaha={deliverMediaViaWaha}
                    setDeliverMediaViaWaha={setDeliverMediaViaWaha}
                  />
                  <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-foreground">Etiquetar novo lead automaticamente</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Ao identificar novo lead, aplica a etiqueta leadsDD-MM-YYYY no Chatwoot.</p>
                    </div>
                    <Switch checked={leadLabelEnabled} onCheckedChange={setLeadLabelEnabled} />
                  </div>
                </section>

                <section className={cn(stitchCard, "space-y-4")}>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-base font-semibold text-foreground">Tools vinculadas</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Carregadas pelo dispatcher (phase 1) para function calling.</p>
                  {linkedTools.length === 0 ? (
                    <p className="text-sm italic text-muted-foreground">Nenhuma tool vinculada.</p>
                  ) : (
                    <div className="space-y-2">
                      {linkedTools.map((tool) => (
                        <div key={tool.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono text-sm">{tool.name}</span>
                            <Badge variant="secondary" className="text-[10px]">{tool.tool_type}</Badge>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => unlinkTool(tool.id)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {unlinkableTools.length > 0 && (
                    <div className="space-y-2 border-t border-dashed border-border pt-4">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adicionar tool</Label>
                      <div className="flex flex-wrap gap-2">
                        {unlinkableTools.map((tool) => (
                          <Button key={tool.id} type="button" variant="outline" size="sm" className="h-8 gap-1 border-border text-xs" onClick={() => linkTool(tool.id)}>
                            <Plus className="h-3 w-3" /> {tool.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {agentTab === "schedule" && (
              <>
                <section className={cn(stitchCard, "space-y-4")}>
                  <BusinessHoursSection
                    enabled={businessHoursEnabled} setEnabled={setBusinessHoursEnabled}
                    hours={businessHours} setHours={setBusinessHours}
                    offlineMessage={offlineMessage} setOfflineMessage={setOfflineMessage}
                  />
                </section>
                <section className={cn(stitchCard, "space-y-4")}>
                  <FollowUpConfigSection
                    enabled={followupEnabled} setEnabled={setFollowupEnabled}
                    intervals={followupIntervals} setIntervals={setFollowupIntervals}
                    quietStart={followupQuietStart} setQuietStart={setFollowupQuietStart}
                    quietEnd={followupQuietEnd} setQuietEnd={setFollowupQuietEnd}
                    followupPrompt={followupPrompt} setFollowupPrompt={setFollowupPrompt}
                    negativeGuardEnabled={followupNegativeGuardEnabled} setNegativeGuardEnabled={setFollowupNegativeGuardEnabled}
                    thinkingDelayMinutes={followupThinkingDelayMinutes} setThinkingDelayMinutes={setFollowupThinkingDelayMinutes}
                  />
                </section>
                <section className={cn(stitchCard, "space-y-4")}>
                  <ReminderConfigSection
                    enabled={reminderEnabled} setEnabled={setReminderEnabled}
                    minutesBefore={reminderMinutesBefore} setMinutesBefore={setReminderMinutesBefore}
                    template={reminderTemplate} setTemplate={setReminderTemplate}
                  />
                </section>
              </>
            )}

            {agentTab === "advanced" && (
              <div className="min-w-0 w-full max-w-full space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:space-y-6">
                <section className={cn(stitchSection, "space-y-4 sm:space-y-6")}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <h3 className={stitchSectionTitle}>Dispatcher (Phase 1)</h3>
                    <Badge variant="secondary" className="w-fit text-[10px]">Tool calling</Badge>
                  </div>
                  <p className="break-words text-xs leading-relaxed text-muted-foreground sm:-mt-2 [overflow-wrap:anywhere]">
                    Escolha o modelo que decide quando acionar ferramentas. Prompt do dispatcher pode estar definido por tenant — veja{' '}
                    <Link className="text-primary underline dark:text-primary" to="/prompts">Prompts</Link>.
                  </p>
                  <div className="space-y-2">
                    <Label className={stitchLbl}>Provedor do dispatcher</Label>
                    <Select value={dispatcherProviderId || "_none"} onValueChange={(v) => setDispatcherProviderId(v === "_none" ? "" : v)}>
                      <SelectTrigger className={cn(fld, "flex h-9 max-w-full min-w-0 items-center [&>span]:min-w-0 [&>span]:truncate")}>
                        <SelectValue placeholder="Nenhum (desabilitado)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum (desabilitado)</SelectItem>
                        {(providers ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} {p.model_default ? ` (${p.model_default})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {dispatcherProviderId && (() => {
                    const dp = (providers ?? []).find((p) => p.id === dispatcherProviderId);
                    const dpModels = dp ? getModelsForProvider(dp.name) : [];
                    if (dpModels.length === 0) return null;
                    return (
                      <div className="space-y-2">
                        <Label className={stitchLbl}>Modelo do dispatcher</Label>
                        <Select value={dispatcherModel || "_default"} onValueChange={(v) => setDispatcherModel(v === "_default" ? "" : v)}>
                          <SelectTrigger className={cn(fld, "flex h-9 max-w-full min-w-0 items-center [&>span]:min-w-0 [&>span]:truncate")}>
                            <SelectValue placeholder="Padrão do provedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_default">Padrão ({dp?.model_default || "gpt-4o-mini"})</SelectItem>
                            {dpModels.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.label} — {m.description}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                </section>

                <section className={cn(stitchSection, "space-y-4 sm:space-y-6")}>
                  <h3 className={stitchSectionTitle}>Parâmetros de geração</h3>
                  <div className="space-y-6 sm:space-y-7">
                    <div className="min-w-0 w-full space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-sm font-medium text-muted-foreground">Temperature</Label>
                        <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{temp.toFixed(2)}</span>
                      </div>
                      <Slider className={sliderTouch} value={[temp]} onValueChange={([v]) => { setTemp(v); setValue("temperature", v); }} min={0} max={2} step={0.05} />
                    </div>
                    <div className="min-w-0 w-full space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-sm font-medium text-muted-foreground">Top P</Label>
                        <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{topP.toFixed(2)}</span>
                      </div>
                      <Slider className={sliderTouch} value={[topP]} onValueChange={([v]) => { setTopP(v); setValue("top_p", v); }} min={0} max={1} step={0.05} />
                      <p className="text-xs leading-relaxed text-muted-foreground">Limita palavras pouco prováveis (0,8 mais focado).</p>
                    </div>
                    <div className="min-w-0 w-full space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-sm font-medium text-muted-foreground">Top K</Label>
                        <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{topK}</span>
                      </div>
                      <Slider className={sliderTouch} value={[topK]} onValueChange={([v]) => { setTopK(v); setValue("top_k", v); }} min={1} max={100} step={1} />
                      <p className="text-xs leading-relaxed text-muted-foreground">Tamanho do vocabulário considerado em cada passo.</p>
                    </div>
                  </div>
                </section>

                <section className={cn(stitchSection, "space-y-4 sm:space-y-6")}>
                  <h3 className={stitchSectionTitle}>Delays de humanização</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground sm:-mt-2">Tempo em segundos com variação automática ±30%.</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
                    <div className="space-y-2">
                      <Label className={stitchLbl}>Leitura</Label>
                      <Input type="number" min={0} step={0.5} value={readDelay} onChange={(e) => setReadDelay(Number(e.target.value))} className={cn(fld, "font-mono text-sm")} />
                    </div>
                    <div className="space-y-2">
                      <Label className={stitchLbl}>Digitando</Label>
                      <Input type="number" min={0} step={0.5} value={typingDelay} onChange={(e) => setTypingDelay(Number(e.target.value))} className={cn(fld, "font-mono text-sm")} />
                    </div>
                    <div className="space-y-2">
                      <Label className={stitchLbl}>Entre blocos</Label>
                      <Input type="number" min={0} step={0.5} value={blockGap} onChange={(e) => setBlockGap(Number(e.target.value))} className={cn(fld, "font-mono text-sm")} />
                    </div>
                  </div>
                </section>

                <section className={cn(stitchSection, "space-y-4")}>
                  <h3 className={stitchSectionTitle}>Debounce de mensagens</h3>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-muted-foreground">Janela (s)</Label>
                    <span className="font-mono text-sm text-foreground">{debounceMs}s</span>
                  </div>
                  <Input type="number" min={0} max={30} step={1} value={debounceMs} onChange={(e) => setDebounceMs(Number(e.target.value))} className={cn(fld, "font-mono text-sm")} />
                  <p className="text-xs text-muted-foreground">
                    {debounceMs > 0 ? `Espera ${debounceMs}s após a última mensagem para consolidar.` : "Desativado — responde a cada mensagem."}
                  </p>
                </section>

                <section className={cn(stitchSection, "space-y-4")}>
                  <h3 className={stitchSectionTitle}>Boas-vindas (primeiro contato)</h3>
                  <p className="text-xs text-muted-foreground">
                    Fluxo típico: texto de boas-vindas, vídeo opcional em seguida, depois pergunta o nome se configurado.
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className={stitchLbl}>URL do vídeo (MP4)</Label>
                      <Input type="url" placeholder="https://exemplo.com/loja.mp4" value={welcomeVideoUrl} onChange={(e) => setWelcomeVideoUrl(e.target.value)} className={cn(fld, "font-mono text-sm")} />
                    </div>
                    <div className="space-y-2">
                      <Label className={stitchLbl}>Pergunta do nome (opcional)</Label>
                      <Input type="text" placeholder="Como posso te chamar?" value={welcomeNameQuestion} onChange={(e) => setWelcomeNameQuestion(e.target.value)} className={fld} />
                    </div>
                  </div>
                </section>

                <section className={cn(stitchSection, "space-y-4")}>
                  <div className="flex items-center gap-2">
                    <Link2 className="h-5 w-5 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                    <h3 className={stitchSectionTitle}>Demo público</h3>
                  </div>
                  <div className="space-y-2">
                    <Label className={stitchLbl}>Senha do demo (vazio = livre)</Label>
                    <Input placeholder="Opcional" value={sandboxPassword} onChange={(e) => setSandboxPassword(e.target.value)} className={fld} />
                  </div>
                  {agentId && (
                    <div className="space-y-2">
                      <Label className={stitchLbl}>Link do demo</Label>
                      <div className={cn(fld, "flex items-center gap-2 py-2")}>
                        <code className="flex-1 truncate font-mono text-xs text-muted-foreground select-all">
                          {`${window.location.origin}/demo/${agentId}`}
                        </code>
                        <button
                          type="button"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                          onClick={() => {
                            void navigator.clipboard.writeText(`${window.location.origin}/demo/${agentId}`);
                            toast.success("Link copiado!");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

              </div>{/* end content area */}
            </form>
          </div>
        </div>
      </div>

      <Dialog open={promptDlg !== "closed"} onOpenChange={(open) => !open && setPromptDlg("closed")}>
        <DialogContent className="max-h-[90vh] max-w-[min(100vw-2rem,42rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle className="text-left">
                {promptDlg === "production" ? "Prompt em produção (preview)" : "System prompt no banco"}
              </DialogTitle>
              {promptDlg === "production" && promptDetail?.fullComposedPrompt ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1 sm:self-auto"
                  onClick={() => {
                    void navigator.clipboard.writeText(promptDetail.fullComposedPrompt ?? "");
                    toast.success("Copiado!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              ) : null}
            </div>
          </DialogHeader>
          <Textarea
            readOnly={promptDlg === "production"}
            value={
              promptDlg === "production" ? (promptDetail?.fullComposedPrompt ?? "") : (watch("system_prompt") ?? "")
            }
            onChange={(e) => promptDlg === "override" && setValue("system_prompt", e.target.value)}
            rows={22}
            className={cn(
              fld,
              "min-h-[380px] font-mono text-sm leading-relaxed",
              promptDlg === "production" && "cursor-default bg-muted/20 dark:bg-muted/30",
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  );

}
