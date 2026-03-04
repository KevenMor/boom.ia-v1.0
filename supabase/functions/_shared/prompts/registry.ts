// ============================================================
// Nexus AI — Prompt Registry
// Maps tenant slugs to their prompt configurations.
// To add a new tenant: create a file and register it here.
// ============================================================

import { BASE_GREETING, DEFAULT_DISPATCHER_PROMPT } from "./base.ts";
import {
  SYSTEM_PROMPT as PPL_SYSTEM,
  COMMUNICATION_RULES as PPL_COMM_RULES,
  DISPATCHER_PROMPT as PPL_DISPATCHER,
  FOLLOWUP_PROMPT as PPL_FOLLOWUP,
} from "./ppl-motors.ts";

/**
 * Configuração de prompt por tenant.
 */
interface TenantPromptConfig {
  /** System prompt completo (substitui o do banco se presente) */
  systemPrompt?: string;
  /** Extensão de regras de comunicação (concatenada ao system prompt) */
  communicationRules?: string;
  /** Dispatcher prompt (Phase 1) */
  dispatcherPrompt: string;
  /** Follow-up prompt (variáveis: {attempt}, {max_attempts}) */
  followupPrompt?: string;
  /** Versão do prompt para referência */
  version: string;
  /** Descrição para exibição no painel */
  description: string;
}

/**
 * Registry de prompts por tenant slug.
 */
const TENANT_PROMPTS: Record<string, TenantPromptConfig> = {
  "ppl-mortors": {
    systemPrompt: PPL_SYSTEM,
    communicationRules: PPL_COMM_RULES,
    dispatcherPrompt: PPL_DISPATCHER,
    followupPrompt: PPL_FOLLOWUP,
    version: "v1.9.0",
    description: "Juliana — SDR PPL Motors (Concessionária Sorocaba/SP)",
  },
  "ppl-motors": {
    systemPrompt: PPL_SYSTEM,
    communicationRules: PPL_COMM_RULES,
    dispatcherPrompt: PPL_DISPATCHER,
    followupPrompt: PPL_FOLLOWUP,
    version: "v1.9.0",
    description: "Juliana — SDR PPL Motors (Concessionária Sorocaba/SP)",
  },
};

/**
 * Retorna o prompt system completo para um agente, compondo:
 * 1. System prompt do tenant (se registrado) OU system_prompt do agente (do banco)
 * 2. Regras de comunicação do tenant (se existir e agente tem inventory tool)
 * 3. Instruções base de saudação (sempre)
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  tenantSlug: string | null,
  hasInventoryTool: boolean,
): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  const base = config?.systemPrompt || agentSystemPrompt || "You are a helpful AI assistant.";
  const commRules = (hasInventoryTool && config?.communicationRules) ? "\n\n" + config.communicationRules : "";
  const greeting = "\n\n" + BASE_GREETING;

  // Inject current Brasilia datetime so the model knows "hoje" and "amanhã"
  const now = new Date();
  const brasiliaFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const nowStr = brasiliaFormatter.format(now);
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const dateContext = `\n\n[CONTEXTO TEMPORAL] Agora: ${nowStr} (Brasília). Hoje: ${todayISO}. Use estas datas como referência ao falar de "hoje", "amanhã", dias da semana, etc.`;

  return base + commRules + greeting + dateContext;
}

/**
 * Retorna o dispatcher prompt para um tenant.
 */
export function getDispatcherPrompt(tenantSlug: string | null): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  return config?.dispatcherPrompt || DEFAULT_DISPATCHER_PROMPT;
}

/**
 * Retorna o follow-up prompt para um tenant.
 * Se não houver configuração específica, retorna null (usa o default do process-followups).
 */
export function getFollowupPrompt(tenantSlug: string | null): string | null {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  return config?.followupPrompt || null;
}

/**
 * Retorna todas as configurações de prompts para exibição no frontend.
 */
export function getAllPromptConfigs(): Record<string, TenantPromptConfig & { slug: string }> {
  const result: Record<string, TenantPromptConfig & { slug: string }> = {};
  const seen = new Set<string>();
  for (const [slug, config] of Object.entries(TENANT_PROMPTS)) {
    if (seen.has(config.description)) continue;
    seen.add(config.description);
    result[slug] = { ...config, slug };
  }
  return result;
}

/**
 * Retorna a configuração de prompt de um tenant específico.
 */
export function getPromptConfig(tenantSlug: string): (TenantPromptConfig & { slug: string }) | null {
  const config = TENANT_PROMPTS[tenantSlug];
  if (!config) return null;
  return { ...config, slug: tenantSlug };
}
