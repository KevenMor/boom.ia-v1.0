// ============================================================
// Nexus AI ��� Prompt Registry
// Maps tenant slugs to their prompt configurations.
// To add a new tenant: create a file and register it here.
// ============================================================

import { BASE_GREETING, DEFAULT_DISPATCHER_PROMPT } from "./base.js";
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
  SYSTEM_PROMPT as VS_SYSTEM,
  COMMUNICATION_RULES as VS_COMM_RULES,
  DISPATCHER_PROMPT as VS_DISPATCHER,
  FOLLOWUP_PROMPT as VS_FOLLOWUP,
} from "./vale-suico.js";

/**
 * Configura?�?�o de prompt por tenant.
 */
interface TenantPromptConfig {
  /** System prompt completo (substitui o do banco se presente) */
  systemPrompt?: string;
  /** Extens?�o de regras de comunica?�?�o (concatenada ao system prompt) */
  communicationRules?: string;
  /** Dispatcher prompt (Phase 1) */
  dispatcherPrompt: string;
  /** Follow-up prompt (vari?�veis: {attempt}, {max_attempts}) */
  followupPrompt?: string;
  /** Always inject communication rules even without inventory tool */
  alwaysInjectCommRules?: boolean;
  /** Vers?�o do prompt para refer?�ncia */
  version: string;
  /** Descri?�?�o para exibi?�?�o no painel */
  description: string;
  /** Se false, o painel pode marcar o tenant como inativo (opcional no registry em código) */
  active?: boolean;
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
  "vale-suico": {
    systemPrompt: VS_SYSTEM,
    communicationRules: VS_COMM_RULES,
    dispatcherPrompt: VS_DISPATCHER,
    followupPrompt: VS_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.39",
    description: "Vitória — Consultora de reservas Vale Suíço Resort",
  },
  "vale-suico-resort": {
    systemPrompt: VS_SYSTEM,
    communicationRules: VS_COMM_RULES,
    dispatcherPrompt: VS_DISPATCHER,
    followupPrompt: VS_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.39",
    description: "Vitória — Consultora de reservas Vale Suíço Resort",
  },
};

/**
 * Retorna o prompt system completo para um agente, compondo:
 * 1. System prompt do tenant (se registrado) OU system_prompt do agente (do banco)
 * 2. Regras de comunica?�?�o do tenant (se existir e agente tem inventory tool)
 * 3. Instru?�?�es base de sauda?�?�o (sempre)
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  tenantSlug: string | null,
  hasInventoryTool: boolean,
): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  const base = config?.systemPrompt || agentSystemPrompt || "You are a helpful AI assistant.";
  const shouldInjectComm = (hasInventoryTool && config?.communicationRules) || config?.alwaysInjectCommRules;
  const commRules = (shouldInjectComm && config?.communicationRules) ? "\n\n" + config.communicationRules : "";
  const greeting = "\n\n" + BASE_GREETING;

  // Inject current Brasilia datetime so the model knows "hoje" and "amanh?�"
  const now = new Date();
  const brasiliaFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const nowStr = brasiliaFormatter.format(now);
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const dateContext = `\n\n[CONTEXTO TEMPORAL] Agora: ${nowStr} (Bras?�lia). Hoje: ${todayISO}. Use estas datas como refer?�ncia ao falar de "hoje", "amanh?�", dias da semana, etc.`;

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
 * Se n?�o houver configura?�?�o espec?�fica, retorna null (usa o default do process-followups).
 */
export function getFollowupPrompt(tenantSlug: string | null): string | null {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  return config?.followupPrompt || null;
}

/**
 * Retorna todas as configura?�?�es de prompts para exibi?�?�o no frontend.
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
 * Retorna a configura?�?�o de prompt de um tenant espec?�fico.
 */
export function getPromptConfig(tenantSlug: string): (TenantPromptConfig & { slug: string }) | null {
  const config = TENANT_PROMPTS[tenantSlug];
  if (!config) return null;
  return { ...config, slug: tenantSlug };
}
