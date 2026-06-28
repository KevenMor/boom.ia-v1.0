import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Clock,
  Loader2,
  Plug,
  Save,
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
const sliderTouch =
  "box-border w-full min-w-0 max-w-full touch-pan-y py-2 sm:py-1.5 [&>span.block]:h-5 [&>span.block]:w-5 sm:[&>span.block]:h-4 sm:[&>span.block]:w-4";

const TABS: { id: EmbedAgentTab; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Informações Básicas", icon: User },
  { id: "model", label: "Modelo de IA", icon: Brain },
  { id: "integration", label: "Integração", icon: Plug },
  { id: "schedule", label: "Horário e Follow-up", icon: Clock },
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

                {agent.prompt.uses_registry && (
                  <div className="space-y-2 rounded-lg border border-amber-200/90 bg-amber-50/90 p-3 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                    Prompt principal no código: {agent.prompt.slug} v{agent.prompt.version ?? "?"}. O campo abaixo é complementar.
                  </div>
                )}

                {agent.prompt.composed_prompt_preview && (
                  <div className="space-y-1.5">
                    <Label className={stitchLbl}>Prompt em produção (preview)</Label>
                    <Textarea readOnly rows={8} value={agent.prompt.composed_prompt_preview} className={cn(fld, "min-h-[160px] resize-y bg-muted/50 font-mono text-xs")} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className={stitchLbl}>System prompt do agente (override opcional)</Label>
                  <Textarea
                    value={state.systemPrompt}
                    onChange={(e) => patch("systemPrompt", e.target.value)}
                    rows={6}
                    className={cn(fld, "min-h-[140px] resize-y font-mono text-sm")}
                  />
                </div>
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
