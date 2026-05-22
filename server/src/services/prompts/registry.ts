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
import {
  SYSTEM_PROMPT as ST_SYSTEM,
  COMMUNICATION_RULES as ST_COMM_RULES,
  DISPATCHER_PROMPT as ST_DISPATCHER,
  FOLLOWUP_PROMPT as ST_FOLLOWUP,
} from "./sunset-thermas.js";
import {
  SYSTEM_PROMPT as DV_SYSTEM,
  COMMUNICATION_RULES as DV_COMM_RULES,
  DISPATCHER_PROMPT as DV_DISPATCHER,
  FOLLOWUP_PROMPT as DV_FOLLOWUP,
} from "./durce-vita.js";
import {
  SYSTEM_PROMPT as CI_SYSTEM,
  COMMUNICATION_RULES as CI_COMM_RULES,
  DISPATCHER_PROMPT as CI_DISPATCHER,
  FOLLOWUP_PROMPT as CI_FOLLOWUP,
} from "./contabilidade-ideal.js";
import {
  SYSTEM_PROMPT as CO_SYSTEM,
  COMMUNICATION_RULES as CO_COMM_RULES,
  DISPATCHER_PROMPT as CO_DISPATCHER,
  FOLLOWUP_PROMPT as CO_FOLLOWUP,
} from "./clinica-odonto.js";
import {
  SYSTEM_PROMPT as IC_SYSTEM,
  COMMUNICATION_RULES as IC_COMM_RULES,
  DISPATCHER_PROMPT as IC_DISPATCHER,
  FOLLOWUP_PROMPT as IC_FOLLOWUP,
} from "./imperio-cfc.js";
import {
  SYSTEM_PROMPT as AI_SYSTEM,
  COMMUNICATION_RULES as AI_COMM_RULES,
  DISPATCHER_PROMPT as AI_DISPATCHER,
  FOLLOWUP_PROMPT as AI_FOLLOWUP,
} from "./autoescola-ideal.js";
import {
  SYSTEM_PROMPT as DI_SYSTEM,
  COMMUNICATION_RULES as DI_COMM_RULES,
  DISPATCHER_PROMPT as DI_DISPATCHER,
  FOLLOWUP_PROMPT as DI_FOLLOWUP,
} from "./dr-iuri.js";
import {
  SYSTEM_PROMPT as BZ_SYSTEM,
  COMMUNICATION_RULES as BZ_COMM_RULES,
  DISPATCHER_PROMPT as BZ_DISPATCHER,
  FOLLOWUP_PROMPT as BZ_FOLLOWUP,
} from "./biazini.js";
import {
  SYSTEM_PROMPT as MVR_SYSTEM,
  COMMUNICATION_RULES as MVR_COMM_RULES,
  DISPATCHER_PROMPT as MVR_DISPATCHER,
  FOLLOWUP_PROMPT as MVR_FOLLOWUP,
} from "./monte-verde-ranch.js";
import {
  SYSTEM_PROMPT as REF_SYSTEM,
  COMMUNICATION_RULES as REF_COMM_RULES,
  DISPATCHER_PROMPT as REF_DISPATCHER,
  FOLLOWUP_PROMPT as REF_FOLLOWUP,
} from "./referency.js";

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
  /** Skip BASE_GREETING injection (tenant has own greeting rules) */
  skipGreeting?: boolean;
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
  referency: {
    systemPrompt: REF_SYSTEM,
    communicationRules: REF_COMM_RULES,
    dispatcherPrompt: REF_DISPATCHER,
    followupPrompt: REF_FOLLOWUP,
    version: "v1.0.0",
    description: "Amanda — SDR Referency (Concessionária)",
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
    version: "v1.2.46",
    description: "Vitória — Consultora de reservas Vale Suíço Resort",
  },
  "vale-suico-resort": {
    systemPrompt: VS_SYSTEM,
    communicationRules: VS_COMM_RULES,
    dispatcherPrompt: VS_DISPATCHER,
    followupPrompt: VS_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.46",
    description: "Vitória — Consultora de reservas Vale Suíço Resort",
  },
  "sunset-thermas-park": {
    systemPrompt: ST_SYSTEM,
    communicationRules: ST_COMM_RULES,
    dispatcherPrompt: ST_DISPATCHER,
    followupPrompt: ST_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.4.0",
    description: "Julia — Consultora de reservas Sunset Thermas Park",
  },
  "sunset-thermas": {
    systemPrompt: ST_SYSTEM,
    communicationRules: ST_COMM_RULES,
    dispatcherPrompt: ST_DISPATCHER,
    followupPrompt: ST_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.4.0",
    description: "Julia — Consultora de reservas Sunset Thermas Park",
  },
  /** Slugs alinhados ao cabeçalho de durce-vita.ts */
  "durce-vita": {
    systemPrompt: DV_SYSTEM,
    communicationRules: DV_COMM_RULES,
    dispatcherPrompt: DV_DISPATCHER,
    followupPrompt: DV_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clínica Odontológica Durce Vita (São Paulo/SP)",
  },
  "durce-vitta": {
    systemPrompt: DV_SYSTEM,
    communicationRules: DV_COMM_RULES,
    dispatcherPrompt: DV_DISPATCHER,
    followupPrompt: DV_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clínica Odontológica Durce Vita (São Paulo/SP)",
  },
  "eliane-durce": {
    systemPrompt: DV_SYSTEM,
    communicationRules: DV_COMM_RULES,
    dispatcherPrompt: DV_DISPATCHER,
    followupPrompt: DV_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clínica Odontológica Durce Vita (São Paulo/SP)",
  },
  "eliane-durce-vitta": {
    systemPrompt: DV_SYSTEM,
    communicationRules: DV_COMM_RULES,
    dispatcherPrompt: DV_DISPATCHER,
    followupPrompt: DV_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clínica Odontológica Durce Vita (São Paulo/SP)",
  },
  "contabilidade-ideal": {
    systemPrompt: CI_SYSTEM,
    communicationRules: CI_COMM_RULES,
    dispatcherPrompt: CI_DISPATCHER,
    followupPrompt: CI_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "Vitória — Lead Converter Grupo Ideal (Contabilidade / IRPF)",
  },
  "clinica-odonto-generica": {
    systemPrompt: CO_SYSTEM,
    communicationRules: CO_COMM_RULES,
    dispatcherPrompt: CO_DISPATCHER,
    followupPrompt: CO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0.0",
    description: "Recepcionista — Clínica odontológica genérica (template)",
  },
  "imperio": {
    systemPrompt: IC_SYSTEM,
    communicationRules: IC_COMM_RULES,
    dispatcherPrompt: IC_DISPATCHER,
    followupPrompt: IC_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v2.0",
    description: "Roberta — SDR Autoescola Império CFC (Sorocaba/SP)",
  },
  "imperio-cfc": {
    systemPrompt: IC_SYSTEM,
    communicationRules: IC_COMM_RULES,
    dispatcherPrompt: IC_DISPATCHER,
    followupPrompt: IC_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v2.0",
    description: "Roberta — SDR Autoescola Império CFC (Sorocaba/SP)",
  },
  "ideal": {
    systemPrompt: AI_SYSTEM,
    communicationRules: AI_COMM_RULES,
    dispatcherPrompt: AI_DISPATCHER,
    followupPrompt: AI_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v8.8",
    description: "Bia — SDR Autoescola Ideal (Sorocaba/SP)",
  },
  "autoescola-ideal": {
    systemPrompt: AI_SYSTEM,
    communicationRules: AI_COMM_RULES,
    dispatcherPrompt: AI_DISPATCHER,
    followupPrompt: AI_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v8.8",
    description: "Bia — SDR Autoescola Ideal (Sorocaba/SP)",
  },
  "dr-iuri": {
    systemPrompt: DI_SYSTEM,
    communicationRules: DI_COMM_RULES,
    dispatcherPrompt: DI_DISPATCHER,
    followupPrompt: DI_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "Camila — Assistente Dr. Iuri (Otomodelação Salvador/BA)",
  },
  "biazini": {
    systemPrompt: BZ_SYSTEM,
    communicationRules: BZ_COMM_RULES,
    dispatcherPrompt: BZ_DISPATCHER,
    followupPrompt: BZ_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0.1",
    description: "Bia — Secretária Equipe Dr. Biazini (Atendimento Veterinário Domiciliar)",
  },
  "monte-verde-ranch": {
    systemPrompt: MVR_SYSTEM,
    communicationRules: MVR_COMM_RULES,
    dispatcherPrompt: MVR_DISPATCHER,
    followupPrompt: MVR_FOLLOWUP,
    alwaysInjectCommRules: true,
    skipGreeting: true,
    version: "v1.2.1",
    description: "Cleide — Atendente Monte Verde Ranch (Fazenda Centenária Sorocaba/SP)",
  },
  "monteverderanch": {
    systemPrompt: MVR_SYSTEM,
    communicationRules: MVR_COMM_RULES,
    dispatcherPrompt: MVR_DISPATCHER,
    followupPrompt: MVR_FOLLOWUP,
    alwaysInjectCommRules: true,
    skipGreeting: true,
    version: "v1.2.1",
    description: "Cleide — Atendente Monte Verde Ranch (Fazenda Centenária Sorocaba/SP)",
  },
  "dp_monte_verde_ranch": {
    systemPrompt: MVR_SYSTEM,
    communicationRules: MVR_COMM_RULES,
    dispatcherPrompt: MVR_DISPATCHER,
    followupPrompt: MVR_FOLLOWUP,
    alwaysInjectCommRules: true,
    skipGreeting: true,
    version: "v1.2.1",
    description: "Cleide — Atendente Monte Verde Ranch (Fazenda Centenária Sorocaba/SP)",
  },
};

/**
 * Normaliza slug só para resolver alias (hífen, underscore, espaço, case).
 * Ex.: "auto-escola-ideal" e "autoescola-ideal" → mesma chave de lookup.
 */
export function normalizeTenantSlugForLookup(slug: string): string {
  return slug.toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveTenantPromptConfig(tenantSlug: string | null): TenantPromptConfig | undefined {
  if (!tenantSlug) return undefined;
  const direct = TENANT_PROMPTS[tenantSlug];
  if (direct) return direct;
  const n = normalizeTenantSlugForLookup(tenantSlug);
  for (const [key, cfg] of Object.entries(TENANT_PROMPTS)) {
    if (normalizeTenantSlugForLookup(key) === n) return cfg;
  }
  return undefined;
}

/**
 * Retorna o prompt system completo para um agente, compondo:
 * 1. **Se o tenant estiver no registry (projeto):** usa somente `systemPrompt` do código; o `system_prompt` do banco é ignorado.
 * 2. **Se não houver registry:** usa `system_prompt` do agente no banco (ou fallback genérico).
 * 3. Regras de comunicação do tenant (se existir e condições de injeção)
 * 4. Instruções base de saudação (sempre)
 */
export function buildSystemPrompt(
  agentSystemPrompt: string,
  tenantSlug: string | null,
  hasInventoryTool: boolean,
): string {
  const config = resolveTenantPromptConfig(tenantSlug);
  const base = config
    ? (config.systemPrompt?.trim() || "You are a helpful AI assistant.")
    : (agentSystemPrompt.trim() || "You are a helpful AI assistant.");
  const shouldInjectComm = (hasInventoryTool && config?.communicationRules) || config?.alwaysInjectCommRules;
  const commRules = (shouldInjectComm && config?.communicationRules) ? "\n\n" + config.communicationRules : "";
  const greeting = config?.skipGreeting ? "" : "\n\n" + BASE_GREETING;

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
  const config = resolveTenantPromptConfig(tenantSlug);
  return config?.dispatcherPrompt || DEFAULT_DISPATCHER_PROMPT;
}

/**
 * Retorna o follow-up prompt para um tenant.
 * Se n?�o houver configura?�?�o espec?�fica, retorna null (usa o default do process-followups).
 */
export function getFollowupPrompt(tenantSlug: string | null): string | null {
  const config = resolveTenantPromptConfig(tenantSlug);
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
  const config = resolveTenantPromptConfig(tenantSlug);
  if (!config) return null;
  return { ...config, slug: tenantSlug };
}
