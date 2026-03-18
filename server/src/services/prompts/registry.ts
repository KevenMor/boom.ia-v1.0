// ============================================================
// Nexus AI — Prompt Registry
// Maps tenant slugs to their prompt configurations.
//
// TENANTS EXISTENTES E NOVOS:
// - Tenants NÃO registrados usam prompts padrão (system do agente, dispatcher default, follow-up genérico).
// - Para prompts customizados: crie arquivo em prompts/ e registre aqui com o slug do tenant.
// - Follow-ups e Lembretes funcionam para QUALQUER tenant (filtro por tenant_id).
// ============================================================

import { BASE_GREETING, DEFAULT_DISPATCHER_PROMPT, GLOBAL_CONDUCT_RULES, GLOBAL_HUMANIZATION, GLOBAL_LANGUAGE_RULES } from "./base.js";
import {
  SYSTEM_PROMPT as PPL_SYSTEM,
  COMMUNICATION_RULES as PPL_COMM_RULES,
  DISPATCHER_PROMPT as PPL_DISPATCHER,
  FOLLOWUP_PROMPT as PPL_FOLLOWUP,
} from "./ppl-motors.js";
import {
  SYSTEM_PROMPT as IVM_SYSTEM,
  COMMUNICATION_RULES as IVM_COMM_RULES,
  DISPATCHER_PROMPT as IVM_DISPATCHER,
  FOLLOWUP_PROMPT as IVM_FOLLOWUP,
} from "./instituto-vicentim-maekawa.js";
import {
  SYSTEM_PROMPT as PH_SYSTEM,
  COMMUNICATION_RULES as PH_COMM_RULES,
  DISPATCHER_PROMPT as PH_DISPATCHER,
  FOLLOWUP_PROMPT as PH_FOLLOWUP,
} from "./pet-home.js";
import {
  SYSTEM_PROMPT as DR_IURI_SYSTEM,
  COMMUNICATION_RULES as DR_IURI_COMM_RULES,
  DISPATCHER_PROMPT as DR_IURI_DISPATCHER,
  FOLLOWUP_PROMPT as DR_IURI_FOLLOWUP,
} from "./dr-iuri.js";
import {
  SYSTEM_PROMPT as IDEAL_SYSTEM,
  COMMUNICATION_RULES as IDEAL_COMM_RULES,
  DISPATCHER_PROMPT as IDEAL_DISPATCHER,
  FOLLOWUP_PROMPT as IDEAL_FOLLOWUP,
} from "./autoescola-ideal.js";

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
  /** Always inject communication rules even without inventory tool */
  alwaysInjectCommRules?: boolean;
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
    version: "v2.0.0",
    description: "Ana Júlia — SDR PPL Motors (Concessionária Sorocaba/SP)",
  },
  "ppl-motors": {
    systemPrompt: PPL_SYSTEM,
    communicationRules: PPL_COMM_RULES,
    dispatcherPrompt: PPL_DISPATCHER,
    followupPrompt: PPL_FOLLOWUP,
    version: "v2.0.0",
    description: "Ana Júlia — SDR PPL Motors (Concessionária Sorocaba/SP)",
  },
  "instituto-vicentim-maekawa": {
    systemPrompt: IVM_SYSTEM,
    communicationRules: IVM_COMM_RULES,
    dispatcherPrompt: IVM_DISPATCHER,
    followupPrompt: IVM_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.0",
    description: "Mariana — Recepcionista Instituto Vicentim Maekawa (Odontologia Sorocaba/SP)",
  },
  // Typo variant in database — maps to the same config
  "insituto-vicentim-maekawa": {
    systemPrompt: IVM_SYSTEM,
    communicationRules: IVM_COMM_RULES,
    dispatcherPrompt: IVM_DISPATCHER,
    followupPrompt: IVM_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.0",
    description: "Mariana — Recepcionista Instituto Vicentim Maekawa (Odontologia Sorocaba/SP)",
  },
  "pet-home": {
    systemPrompt: PH_SYSTEM,
    communicationRules: PH_COMM_RULES,
    dispatcherPrompt: PH_DISPATCHER,
    followupPrompt: PH_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Tia Ana — Atendente Pet Home (Hotel e Creche para Cachorros Sorocaba/SP)",
  },
  "pet-home-tia-erica": {
    systemPrompt: PH_SYSTEM,
    communicationRules: PH_COMM_RULES,
    dispatcherPrompt: PH_DISPATCHER,
    followupPrompt: PH_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Tia Ana — Atendente Pet Home (Hotel e Creche para Cachorros Sorocaba/SP)",
  },
  "dr-iuri": {
    systemPrompt: DR_IURI_SYSTEM,
    communicationRules: DR_IURI_COMM_RULES,
    dispatcherPrompt: DR_IURI_DISPATCHER,
    followupPrompt: DR_IURI_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "Camila — Assistente Dr. Iuri (Otomodelação Salvador/BA)",
  },
  "ideal": {
    systemPrompt: IDEAL_SYSTEM,
    communicationRules: IDEAL_COMM_RULES,
    dispatcherPrompt: IDEAL_DISPATCHER,
    followupPrompt: IDEAL_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v8.0-flash",
    description: "Bia — SDR Autoescola Ideal (Sorocaba/SP)",
  },
  "autoescola-ideal": {
    systemPrompt: IDEAL_SYSTEM,
    communicationRules: IDEAL_COMM_RULES,
    dispatcherPrompt: IDEAL_DISPATCHER,
    followupPrompt: IDEAL_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v8.0-flash",
    description: "Bia — SDR Autoescola Ideal (Sorocaba/SP)",
  },
  "auto-escola-ideal": {
    systemPrompt: IDEAL_SYSTEM,
    communicationRules: IDEAL_COMM_RULES,
    dispatcherPrompt: IDEAL_DISPATCHER,
    followupPrompt: IDEAL_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v8.0-flash",
    description: "Bia — SDR Autoescola Ideal (Sorocaba/SP)",
  },
};

/**
 * Retorna o prompt system completo para um agente, compondo:
 * 1. System prompt do tenant (se registrado) OU system_prompt do agente (do banco)
 * 2. Regras de comunicação do tenant (se existir e agente tem inventory tool)
 * 3. Instruções base de saudação (sempre)
 * 4. Regras globais de conduta (nome/dados só do que o cliente informou — sempre)
 * 5. Humanização e idioma (português-BR exclusivo)
 * 6. Contexto de pet (nome + gênero inferido) para Pet Home, quando aplicável
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  tenantSlug: string | null,
  hasInventoryTool: boolean,
  petContext?: string | null,
): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  const base = config?.systemPrompt || agentSystemPrompt || "You are a helpful AI assistant.";
  const shouldInjectComm = (hasInventoryTool && config?.communicationRules) || config?.alwaysInjectCommRules;
  const commRules = (shouldInjectComm && config?.communicationRules) ? "\n\n" + config.communicationRules : "";
  const greeting = "\n\n" + BASE_GREETING;
  const globalRules = "\n\n" + GLOBAL_CONDUCT_RULES;
  const humanization = "\n\n" + GLOBAL_HUMANIZATION;
  const languageRules = "\n\n" + GLOBAL_LANGUAGE_RULES;

  // Inject current Brasilia datetime so the model knows "hoje" and "amanhã"
  const now = new Date();
  const brasiliaFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const nowStr = brasiliaFormatter.format(now);
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const dateContext = `\n\n[CONTEXTO TEMPORAL] Agora: ${nowStr} (Brasília). Hoje: ${todayISO}. Use estas datas como referência ao falar de "hoje", "amanhã", dias da semana, etc.`;

  const petContextBlock = petContext ? `\n\n${petContext}` : "";

  return base + commRules + greeting + globalRules + humanization + languageRules + dateContext + petContextBlock;
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
