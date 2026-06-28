import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AgentMirrorPayload } from "@/lib/chatwoot-embed-mirror";
import { ChevronDown } from "lucide-react";

function cfg(agent: AgentMirrorPayload, key: string): unknown {
  return agent.config[key];
}

function fmtBool(v: unknown): string {
  return v ? "Sim" : "Não";
}

function fmtMsSeconds(v: unknown, fallbackMs: number): string {
  const n = typeof v === "number" ? v : fallbackMs;
  return `${(n / 1000).toFixed(1)} s`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid gap-1 border-b border-border/60 py-2 last:border-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-muted/40">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3">
        <dl>{children}</dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  agent: AgentMirrorPayload;
}

export function AgentMirrorPanel({ agent }: Props) {
  const statusClass =
    agent.status === "active"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : agent.status === "test"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        {agent.avatar_url ? (
          <img src={agent.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {agent.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <Badge className={cn("capitalize", statusClass)}>{agent.status}</Badge>
          </div>
          {agent.description && <p className="mt-1 text-sm text-muted-foreground">{agent.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {agent.tenant_name ?? "Empresa"} · atualizado{" "}
            {agent.updated_at ? new Date(agent.updated_at).toLocaleString("pt-BR") : "—"}
          </p>
        </div>
      </div>

      <Section title="Informações básicas">
        <Field label="Empresa" value={agent.tenant_name} />
        <Field label="Slug do tenant" value={agent.tenant_slug} />
        <Field label="ID do agente" value={agent.id} />
        <Field label="Webhook" value={agent.webhook_url} />
      </Section>

      <Section title="Modelo de IA">
        <Field label="Provider" value={agent.provider_name ?? "—"} />
        <Field label="Modelo" value={agent.model ?? "—"} />
        <Field label="Temperatura" value={String(agent.temperature)} />
        <Field label="Top P" value={String(cfg(agent, "top_p") ?? "0.8")} />
        <Field label="Top K" value={String(cfg(agent, "top_k") ?? "40")} />
        <Field
          label="Prompt override (agente)"
          value={agent.system_prompt?.trim() ? agent.system_prompt : "— (usa prompt do registry)"}
        />
        {agent.prompt.uses_registry && (
          <>
            <Field label="Prompt registry" value={`${agent.prompt.slug} v${agent.prompt.version ?? "?"}`} />
            <Field label="Descrição do prompt" value={agent.prompt.description} />
            <Field label="Prompt composto (preview)" value={agent.prompt.composed_prompt_preview} />
          </>
        )}
        <Field label="Dispatcher — provider" value={String(cfg(agent, "dispatcher_provider_id") || "—")} />
        <Field label="Dispatcher — modelo" value={String(cfg(agent, "dispatcher_model") || "—")} />
        <Field label="Dispatcher — prompt" value={String(cfg(agent, "dispatcher_prompt") || "—")} />
      </Section>

      <Section title="Integração">
        <Field label="Chatwoot URL" value={String(cfg(agent, "chatwoot_url") || "—")} />
        <Field label="Chatwoot account ID" value={String(cfg(agent, "chatwoot_account_id") || "—")} />
        <Field label="Chatwoot API token" value={String(cfg(agent, "chatwoot_api_token") || "—")} />
        <Field label="WAHA URL" value={String(cfg(agent, "waha_url") || "—")} />
        <Field label="WAHA session" value={String(cfg(agent, "waha_session") || "default")} />
        <Field label="WAHA API key" value={String(cfg(agent, "waha_api_key") || "—")} />
        <Field label="Mídia via WAHA" value={fmtBool(cfg(agent, "deliver_media_via_waha"))} />
        <Field label="Assignee teste" value={String(cfg(agent, "test_assignee_id") || "—")} />
        <Field label="Assignee do agente IA" value={String(cfg(agent, "agent_assignee_id") || "—")} />
        <Field label="Etiqueta de lead" value={fmtBool(cfg(agent, "lead_label_enabled"))} />
        <Field label="Vídeo de boas-vindas" value={String(cfg(agent, "welcome_video_url") || "—")} />
        <Field label="Pergunta nome boas-vindas" value={String(cfg(agent, "welcome_name_question") || "—")} />
      </Section>

      <Section title="Horário e follow-up">
        <Field label="Horário comercial" value={fmtBool(cfg(agent, "business_hours_enabled"))} />
        <Field
          label="Janela comercial"
          value={
            cfg(agent, "business_hours")
              ? JSON.stringify(cfg(agent, "business_hours"), null, 2)
              : "—"
          }
        />
        <Field label="Mensagem offline" value={String(cfg(agent, "offline_message") || "—")} />
        <Field label="Follow-up ativo" value={fmtBool(cfg(agent, "followup_enabled"))} />
        <Field label="Follow-up tentativas" value={String(cfg(agent, "followup_max_attempts") ?? "—")} />
        <Field label="Follow-up intervalos (min)" value={JSON.stringify(cfg(agent, "followup_intervals") ?? [])} />
        <Field label="Follow-up silêncio" value={`${cfg(agent, "followup_quiet_start") ?? "22:00"} – ${cfg(agent, "followup_quiet_end") ?? "08:00"}`} />
        <Field label="Follow-up prompt" value={String(cfg(agent, "followup_prompt") || "—")} />
        <Field label="Guard negativo" value={fmtBool(cfg(agent, "followup_negative_guard_enabled") !== false)} />
        <Field label="Lembrete ativo" value={fmtBool(cfg(agent, "reminder_enabled"))} />
        <Field label="Lembrete (min antes)" value={String(cfg(agent, "reminder_minutes_before") ?? "—")} />
        <Field label="Template lembrete" value={String(cfg(agent, "reminder_template") || "—")} />
      </Section>

      <Section title="Avançados">
        <Field label="Delay leitura" value={fmtMsSeconds(cfg(agent, "read_delay_ms"), 1500)} />
        <Field label="Delay digitando" value={fmtMsSeconds(cfg(agent, "typing_delay_ms"), 800)} />
        <Field label="Gap entre blocos" value={fmtMsSeconds(cfg(agent, "block_gap_ms"), 2000)} />
        <Field label="Debounce mensagens" value={fmtMsSeconds(cfg(agent, "message_debounce_ms"), 3000)} />
        <Field label="Senha sandbox" value={String(cfg(agent, "sandbox_password") || "—")} />
      </Section>

      <Section title={`Tools vinculadas (${agent.tools.length})`} defaultOpen={agent.tools.length > 0}>
        {agent.tools.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nenhuma tool vinculada.</p>
        ) : (
          <ul className="space-y-2">
            {agent.tools.map((tool) => (
              <li key={tool.id} className="rounded-md border border-border/70 px-3 py-2">
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
      </Section>
    </div>
  );
}
