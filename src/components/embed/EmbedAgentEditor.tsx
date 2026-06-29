import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Clock,
  Loader2,
  Maximize2,
  Plug,
  Save,
  SlidersHorizontal,
  User,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentAvatarUpload } from "@/components/agents/AgentAvatarUpload";
import { AgentStatusField } from "@/components/agents/AgentStatusField";
import { ChatwootConfigSection } from "@/components/agents/ChatwootConfigSection";
import { FollowUpConfigSection } from "@/components/agents/FollowUpConfigSection";
import { BusinessHoursSection } from "@/components/agents/BusinessHoursSection";
import { ReminderConfigSection } from "@/components/agents/ReminderConfigSection";
import {
  buildEmbedFormState,
  buildEmbedUpdatePayload,
  type EmbedAgentFormState,
  type EmbedAgentTab,
} from "@/lib/embed-agent-form";
import {
  updateChatwootAgentEmbed,
  type AgentMirrorPayload,
  type MirrorProviderRow,
} from "@/lib/chatwoot-embed-mirror";
import { getModelsForProvider } from "@/lib/provider-models";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fld =
  "w-full min-w-0 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-1 focus:ring-foreground/20 dark:bg-card";
const stitchLbl = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const stitchCard = "rounded-lg border border-border bg-card p-4 sm:p-6";
const codePreviewFld =
  "min-h-[min(480px,52vh)] max-h-[72vh] resize-y overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/40 px-4 py-4 font-mono text-[13px] leading-relaxed text-foreground dark:bg-[#12171e] dark:border-border";

const sliderTouch =
  "box-border w-full min-w-0 max-w-full touch-pan-y py-2 sm:py-1.5 [&>span.block]:h-5 [&>span.block]:w-5 sm:[&>span.block]:h-4 sm:[&>span.block]:w-4";

function formatPromptVersion(version: string | null | undefined): string {
  if (!version) return "?";
  return version.startsWith("v") ? version : `v${version}`;
}

const TABS: { id: EmbedAgentTab; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Informações Básicas", icon: User },
  { id: "model", label: "Modelo de IA", icon: Brain },
  { id: "integration", label: "Integração", icon: Plug },
  { id: "schedule", label: "Horário e Follow-up", icon: Clock },
  { id: "advanced", label: "Avançados", icon: SlidersHorizontal },
];

interface Props {
  agent: AgentMirrorPayload;
  providers: MirrorProviderRow[];
  accountId: string;
  embedKey: string;
  apiBase: string;
  onSaved: (agent: AgentMirrorPayload) => void;
}

export function EmbedAgentEditor({ agent, providers, accountId, embedKey, apiBase, onSaved }: Props) {
  const [tab, setTab] = useState<EmbedAgentTab>("basic");
  const [saving, setSaving] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [state, setState] = useState<EmbedAgentFormState>(() => buildEmbedFormState(agent));

  useEffect(() => {
    setState(buildEmbedFormState(agent));
  }, [agent]);

  const patch = <K extends keyof EmbedAgentFormState>(key: K, value: EmbedAgentFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === state.providerId),
    [providers, state.providerId],
  );
  const models = getModelsForProvider(selectedProvider?.name);

  const dispatcherProvider = useMemo(
    () => providers.find((p) => p.id === state.dispatcherProviderId),
    [providers, state.dispatcherProviderId],
  );
  const dispatcherModels = getModelsForProvider(dispatcherProvider?.name);

  const statusLabel =
    state.status === "active" ? "Ativo" : state.status === "test" ? "Teste" : "Inativo";

  const onSave = async () => {
    if (!state.name.trim()) {
      toast.error("Informe o nome do agente");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateChatwootAgentEmbed(
        agent.id,
        accountId,
        embedKey,
        buildEmbedUpdatePayload(agent, state),
        apiBase,
      );
      toast.success("Agente atualizado");
      onSaved(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-col bg-background">
      <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{state.name.trim() || "Editar Agente"}</h2>
          <Badge
            variant="secondary"
            className={cn(
              "shrink-0 text-xs font-medium",
              state.status === "active" && "border-success/30 bg-success/10 text-success",
              state.status === "test" && "border-warning/30 bg-warning/10 text-warning",
              state.status === "inactive" && "border-muted-foreground/30 bg-muted text-muted-foreground",
            )}
          >
            {statusLabel}
          </Badge>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="h-9 shrink-0 gap-1.5 rounded-md px-3 text-xs font-semibold sm:h-10 sm:gap-2 sm:px-6 sm:text-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] flex-1 px-3 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 gap-6">
          <aside className="sticky top-[73px] hidden h-fit w-[220px] shrink-0 lg:block">
            <nav className="flex flex-col gap-0.5 rounded-lg border border-border bg-card p-2">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-foreground/[0.06] text-foreground dark:bg-foreground/10"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 space-y-5 sm:space-y-8">
            <div className="flex gap-2 overflow-x-auto lg:hidden">
              {TABS.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  size="sm"
                  variant={tab === t.id ? "default" : "outline"}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>

            {tab === "basic" && (
              <section className={stitchCard}>
                <h3 className="mb-4 text-base font-semibold">Informações Básicas</h3>
                <div className="mb-6 flex justify-center sm:justify-start">
                  <AgentAvatarUpload
                    currentUrl={state.avatarUrl}
                    onUploaded={(url) => patch("avatarUrl", url)}
                    layout="stitch"
                    stitchSize="compact"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className={stitchLbl}>Nome</Label>
                    <Input value={state.name} onChange={(e) => patch("name", e.target.value)} className={fld} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className={stitchLbl}>Descrição interna</Label>
                    <Textarea
                      value={state.description}
                      onChange={(e) => patch("description", e.target.value)}
                      rows={2}
                      className={cn(fld, "min-h-[72px] resize-y")}
                    />
                  </div>
                </div>
                <div className="mt-6 space-y-2">
                  <Label className={stitchLbl}>Situação do cadastro</Label>
                  <AgentStatusField
                    value={state.status}
                    onChange={(v) => patch("status", v)}
                    idPrefix={`embed-${agent.id}-status`}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {agent.tenant_name ?? "Empresa"} · conta Chatwoot {accountId}
                </p>
              </section>
            )}

            {tab === "model" && (
              <section className={cn(stitchCard, "space-y-5")}>
                <h3 className="text-base font-semibold">Modelo de IA</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className={stitchLbl}>Provider</Label>
                    <Select value={state.providerId || undefined} onValueChange={(v) => patch("providerId", v)}>
                      <SelectTrigger className={fld}>
                        <SelectValue placeholder="Selecionar provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={stitchLbl}>Modelo</Label>
                    {models.length > 0 ? (
                      <Select value={state.model || models[0]?.value} onValueChange={(v) => patch("model", v)}>
                        <SelectTrigger className={cn(fld, "h-auto min-h-[44px] py-2")}>
                          <SelectValue />
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
                    ) : (
                      <Input value={state.model} onChange={(e) => patch("model", e.target.value)} className={cn(fld, "font-mono")} />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className={stitchLbl}>Temperatura · {state.temperature.toFixed(2)}</Label>
                  </div>
                  <Slider
                    className={sliderTouch}
                    min={0}
                    max={2}
                    step={0.05}
                    value={[state.temperature]}
                    onValueChange={([v]) => patch("temperature", v)}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={stitchLbl}>Top P · {state.topP.toFixed(2)}</Label>
                    <Slider className={sliderTouch} min={0} max={1} step={0.05} value={[state.topP]} onValueChange={([v]) => patch("topP", v)} />
                  </div>
                  <div className="space-y-2">
                    <Label className={stitchLbl}>Top K · {state.topK}</Label>
                    <Slider className={sliderTouch} min={1} max={100} step={1} value={[state.topK]} onValueChange={([v]) => patch("topK", v)} />
                  </div>
                </div>

                {agent.prompt.uses_registry ? (
                  <div className="flex gap-3 rounded-xl border border-border border-l-[3px] border-l-primary bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      i
                    </span>
                    <div className="min-w-0">
                      <Badge variant="secondary" className="mb-2 font-mono text-[11px]">
                        {agent.prompt.slug} {formatPromptVersion(agent.prompt.version)}
                      </Badge>
                      <p>
                        Prompt definido no código do repositório. O campo{" "}
                        <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                          system_prompt
                        </code>{" "}
                        do banco não é usado em produção.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 rounded-xl border border-border border-l-[3px] border-l-muted-foreground/40 bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      i
                    </span>
                    <p>Este tenant não tem prompt no registry. Gerencie o prompt no painel Boom IA.</p>
                  </div>
                )}

                {agent.prompt.composed_prompt_preview ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label className={cn(stitchLbl, "!mb-0")}>Preview montado pelo servidor</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setPromptExpanded(true)}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Expandir
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      spellCheck={false}
                      value={agent.prompt.composed_prompt_preview}
                      className={cn(codePreviewFld, "cursor-default focus-visible:ring-0")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Bloco do tenant + regras globais, idioma e data. No chat pode variar conforme ferramentas e calendário.
                    </p>
                    <Dialog open={promptExpanded} onOpenChange={setPromptExpanded}>
                      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
                        <DialogHeader className="border-b border-border px-5 py-4">
                          <DialogTitle>Prompt em produção</DialogTitle>
                        </DialogHeader>
                        <Textarea
                          readOnly
                          spellCheck={false}
                          value={agent.prompt.composed_prompt_preview}
                          className={cn(
                            codePreviewFld,
                            "min-h-[min(70vh,640px)] max-h-none flex-1 resize-none rounded-none border-0 bg-muted/30 focus-visible:ring-0",
                          )}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : null}
              </section>
            )}

            {tab === "integration" && (
              <>
                <section className={cn(stitchCard, "space-y-4")}>
                  <h3 className="text-base font-semibold">Integração Chatwoot &amp; WAHA</h3>
                  <ChatwootConfigSection
                    chatwootUrl={state.chatwootUrl}
                    setChatwootUrl={(v) => patch("chatwootUrl", v)}
                    chatwootApiToken={state.chatwootApiToken}
                    setChatwootApiToken={(v) => patch("chatwootApiToken", v)}
                    chatwootAccountId={state.chatwootAccountId}
                    setChatwootAccountId={(v) => patch("chatwootAccountId", v)}
                    webhookUrl={agent.webhook_url ?? undefined}
                    wahaUrl={state.wahaUrl}
                    setWahaUrl={(v) => patch("wahaUrl", v)}
                    wahaApiKey={state.wahaApiKey}
                    setWahaApiKey={(v) => patch("wahaApiKey", v)}
                    wahaSession={state.wahaSession}
                    setWahaSession={(v) => patch("wahaSession", v)}
                    deliverMediaViaWaha={state.deliverMediaViaWaha}
                    setDeliverMediaViaWaha={(v) => patch("deliverMediaViaWaha", v)}
                  />
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-sm font-semibold">Etiquetar novo lead automaticamente</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Aplica etiqueta leadsDD-MM-YYYY no Chatwoot.</p>
                    </div>
                    <Switch checked={state.leadLabelEnabled} onCheckedChange={(v) => patch("leadLabelEnabled", v)} />
                  </div>
                </section>

                <section className={cn(stitchCard, "space-y-3")}>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-base font-semibold">Tools vinculadas</h3>
                  </div>
                  {agent.tools.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma tool vinculada.</p>
                  ) : (
                    <ul className="space-y-2">
                      {agent.tools.map((tool) => (
                        <li key={tool.id} className="rounded-md border border-border px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{tool.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {tool.tool_type}
                            </Badge>
                          </div>
                          {tool.description && <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {tab === "advanced" && (
              <section className={cn(stitchCard, "space-y-5")}>
                <div>
                  <h3 className="text-base font-semibold">Dispatcher (Phase 1)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modelo que decide quando acionar ferramentas. O prompt do dispatcher é definido no código do tenant.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className={stitchLbl}>Provedor do dispatcher</Label>
                  <Select
                    value={state.dispatcherProviderId || "_none"}
                    onValueChange={(v) => patch("dispatcherProviderId", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger className={fld}>
                      <SelectValue placeholder="Nenhum (desabilitado)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum (desabilitado)</SelectItem>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Dual-provider: este modelo roteia tools; o modelo conversacional responde ao cliente.
                  </p>
                </div>
                {state.dispatcherProviderId ? (
                  <div className="space-y-1.5">
                    <Label className={stitchLbl}>Modelo do dispatcher</Label>
                    {dispatcherModels.length > 0 ? (
                      <Select
                        value={state.dispatcherModel || "_default"}
                        onValueChange={(v) => patch("dispatcherModel", v === "_default" ? "" : v)}
                      >
                        <SelectTrigger className={fld}>
                          <SelectValue placeholder="Padrão do provedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_default">Padrão (gpt-4o)</SelectItem>
                          {dispatcherModels.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={state.dispatcherModel}
                        onChange={(e) => patch("dispatcherModel", e.target.value)}
                        className={cn(fld, "font-mono")}
                        placeholder="ex: gpt-4o (vazio = padrão)"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">Deixe vazio para usar o padrão (geralmente gpt-4o).</p>
                  </div>
                ) : null}
              </section>
            )}

            {tab === "schedule" && (
              <>
                <section className={stitchCard}>
                  <BusinessHoursSection
                    enabled={state.businessHoursEnabled}
                    setEnabled={(v) => patch("businessHoursEnabled", v)}
                    hours={state.businessHours}
                    setHours={(v) => patch("businessHours", v)}
                    offlineMessage={state.offlineMessage}
                    setOfflineMessage={(v) => patch("offlineMessage", v)}
                  />
                </section>
                <section className={stitchCard}>
                  <FollowUpConfigSection
                    enabled={state.followupEnabled}
                    setEnabled={(v) => patch("followupEnabled", v)}
                    intervals={state.followupIntervals}
                    setIntervals={(v) => patch("followupIntervals", v)}
                    quietStart={state.followupQuietStart}
                    setQuietStart={(v) => patch("followupQuietStart", v)}
                    quietEnd={state.followupQuietEnd}
                    setQuietEnd={(v) => patch("followupQuietEnd", v)}
                    followupPrompt={state.followupPrompt}
                    setFollowupPrompt={(v) => patch("followupPrompt", v)}
                    negativeGuardEnabled={state.followupNegativeGuardEnabled}
                    setNegativeGuardEnabled={(v) => patch("followupNegativeGuardEnabled", v)}
                    thinkingDelayMinutes={state.followupThinkingDelayMinutes}
                    setThinkingDelayMinutes={(v) => patch("followupThinkingDelayMinutes", v)}
                  />
                </section>
                <section className={stitchCard}>
                  <ReminderConfigSection
                    enabled={state.reminderEnabled}
                    setEnabled={(v) => patch("reminderEnabled", v)}
                    minutesBefore={state.reminderMinutesBefore}
                    setMinutesBefore={(v) => patch("reminderMinutesBefore", v)}
                    template={state.reminderTemplate}
                    setTemplate={(v) => patch("reminderTemplate", v)}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
