import type { AgentMirrorPayload } from "@/lib/chatwoot-embed-mirror";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@/components/agents/BusinessHoursSection";

export type EmbedAgentTab = "basic" | "model" | "integration" | "schedule";

export interface EmbedAgentFormState {
  name: string;
  description: string;
  status: string;
  avatarUrl: string | null;
  providerId: string;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  chatwootUrl: string;
  chatwootApiToken: string;
  chatwootAccountId: string;
  wahaUrl: string;
  wahaApiKey: string;
  wahaSession: string;
  deliverMediaViaWaha: boolean;
  leadLabelEnabled: boolean;
  followupEnabled: boolean;
  followupIntervals: number[];
  followupQuietStart: string;
  followupQuietEnd: string;
  followupPrompt: string;
  followupNegativeGuardEnabled: boolean;
  followupThinkingDelayMinutes: number;
  businessHoursEnabled: boolean;
  businessHours: BusinessHours;
  offlineMessage: string;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  reminderTemplate: string;
}

function cfg(agent: AgentMirrorPayload, key: string, fallback: unknown = ""): unknown {
  return agent.config[key] ?? fallback;
}

export function buildEmbedFormState(agent: AgentMirrorPayload): EmbedAgentFormState {
  return {
    name: agent.name,
    description: agent.description ?? "",
    status: agent.status,
    avatarUrl: agent.avatar_url,
    providerId: agent.provider_id ?? "",
    model: agent.model ?? "",
    temperature: agent.temperature,
    topP: Number(cfg(agent, "top_p", 0.8)),
    topK: Number(cfg(agent, "top_k", 40)),
    chatwootUrl: String(cfg(agent, "chatwoot_url", "")),
    chatwootApiToken: String(cfg(agent, "chatwoot_api_token", "")),
    chatwootAccountId: String(cfg(agent, "chatwoot_account_id", "")),
    wahaUrl: String(cfg(agent, "waha_url", "")),
    wahaApiKey: String(cfg(agent, "waha_api_key", "")),
    wahaSession: String(cfg(agent, "waha_session", "default")),
    deliverMediaViaWaha: Boolean(cfg(agent, "deliver_media_via_waha")),
    leadLabelEnabled: Boolean(cfg(agent, "lead_label_enabled")),
    followupEnabled: Boolean(cfg(agent, "followup_enabled")),
    followupIntervals: (cfg(agent, "followup_intervals", [10, 20, 30]) as number[]) ?? [10, 20, 30],
    followupQuietStart: String(cfg(agent, "followup_quiet_start", "22:00")),
    followupQuietEnd: String(cfg(agent, "followup_quiet_end", "08:00")),
    followupPrompt: String(cfg(agent, "followup_prompt", "")),
    followupNegativeGuardEnabled: cfg(agent, "followup_negative_guard_enabled") !== false,
    followupThinkingDelayMinutes: Number(cfg(agent, "followup_thinking_delay_minutes", 2880)),
    businessHoursEnabled: Boolean(cfg(agent, "business_hours_enabled")),
    businessHours: (cfg(agent, "business_hours", DEFAULT_BUSINESS_HOURS) as BusinessHours) ?? DEFAULT_BUSINESS_HOURS,
    offlineMessage: String(cfg(agent, "offline_message", cfg(agent, "business_hours_offline_message", ""))),
    reminderEnabled: Boolean(cfg(agent, "reminder_enabled")),
    reminderMinutesBefore: Number(cfg(agent, "reminder_minutes_before", 60)),
    reminderTemplate: String(cfg(agent, "reminder_template", "")),
  };
}

export function buildEmbedUpdatePayload(agent: AgentMirrorPayload, state: EmbedAgentFormState) {
  const currentConfig = agent.config ?? {};
  return {
    name: state.name.trim(),
    description: state.description.trim() || null,
    status: state.status,
    avatar_url: state.avatarUrl,
    provider_id: state.providerId || null,
    model: state.model || null,
    temperature: state.temperature,
    config: {
      ...currentConfig,
      top_p: state.topP,
      top_k: state.topK,
      chatwoot_url: state.chatwootUrl || undefined,
      chatwoot_api_token: state.chatwootApiToken || undefined,
      chatwoot_account_id: state.chatwootAccountId || undefined,
      waha_url: state.wahaUrl || undefined,
      waha_api_key: state.wahaApiKey || undefined,
      waha_session: state.wahaSession || "default",
      deliver_media_via_waha: state.deliverMediaViaWaha,
      lead_label_enabled: state.leadLabelEnabled,
      followup_enabled: state.followupEnabled,
      followup_max_attempts: state.followupIntervals.length,
      followup_intervals: state.followupIntervals,
      followup_quiet_start: state.followupQuietStart || undefined,
      followup_quiet_end: state.followupQuietEnd || undefined,
      followup_prompt: state.followupPrompt || undefined,
      followup_negative_guard_enabled: state.followupNegativeGuardEnabled,
      followup_thinking_delay_minutes: state.followupThinkingDelayMinutes,
      business_hours_enabled: state.businessHoursEnabled,
      business_hours: state.businessHours,
      business_hours_offline_message: state.offlineMessage || undefined,
      reminder_enabled: state.reminderEnabled,
      reminder_minutes_before: state.reminderMinutesBefore,
      reminder_template: state.reminderTemplate || undefined,
    },
  };
}
