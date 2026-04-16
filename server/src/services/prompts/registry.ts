// ============================================================
// Nexus AI — Prompt Registry
// Maps tenant slugs to their prompt configurations.
//
// TENANTS EXISTENTES E NOVOS:
// - Tenants NÃO registrados usam prompts padrão (system do agente, dispatcher default, follow-up genérico).
// - Para prompts customizados: crie arquivo em prompts/ e registre aqui com o slug do tenant.
// - Follow-ups e Lembretes funcionam para QUALQUER tenant (filtro por tenant_id).
// ============================================================

import { BASE_GREETING, DEFAULT_DISPATCHER_PROMPT, GLOBAL_CONDUCT_RULES, GLOBAL_HUMANIZATION, GLOBAL_LANGUAGE_RULES, GLOBAL_SHORT_ACK_RULES } from "./base.js";
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
import {
  SYSTEM_PROMPT as DURCE_SYSTEM,
  COMMUNICATION_RULES as DURCE_COMM_RULES,
  DISPATCHER_PROMPT as DURCE_DISPATCHER,
  FOLLOWUP_PROMPT as DURCE_FOLLOWUP,
} from "./durce-vita.js";
import {
  SYSTEM_PROMPT as ODONTO_SYSTEM,
  COMMUNICATION_RULES as ODONTO_COMM_RULES,
  DISPATCHER_PROMPT as ODONTO_DISPATCHER,
  FOLLOWUP_PROMPT as ODONTO_FOLLOWUP,
} from "./clinica-odonto.js";
import {
  SYSTEM_PROMPT as IMPERIO_SYSTEM,
  COMMUNICATION_RULES as IMPERIO_COMM_RULES,
  DISPATCHER_PROMPT as IMPERIO_DISPATCHER,
  FOLLOWUP_PROMPT as IMPERIO_FOLLOWUP,
} from "./imperio-cfc.js";
import {
  SYSTEM_PROMPT as CONTABILIDADE_IDEAL_SYSTEM,
  COMMUNICATION_RULES as CONTABILIDADE_IDEAL_COMM_RULES,
  DISPATCHER_PROMPT as CONTABILIDADE_IDEAL_DISPATCHER,
  FOLLOWUP_PROMPT as CONTABILIDADE_IDEAL_FOLLOWUP,
} from "./contabilidade-ideal.js";
import {
  SYSTEM_PROMPT as VALE_SUICO_SYSTEM,
  COMMUNICATION_RULES as VALE_SUICO_COMM_RULES,
  DISPATCHER_PROMPT as VALE_SUICO_DISPATCHER,
  FOLLOWUP_PROMPT as VALE_SUICO_FOLLOWUP,
} from "./vale-suico.js";

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
  "eliane-durce": {
    systemPrompt: DURCE_SYSTEM,
    communicationRules: DURCE_COMM_RULES,
    dispatcherPrompt: DURCE_DISPATCHER,
    followupPrompt: DURCE_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clinica Odontologica Durce Vita (Odontologia Sao Paulo/SP)",
  },
  "durce-vita": {
    systemPrompt: DURCE_SYSTEM,
    communicationRules: DURCE_COMM_RULES,
    dispatcherPrompt: DURCE_DISPATCHER,
    followupPrompt: DURCE_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clinica Odontologica Durce Vita (Odontologia Sao Paulo/SP)",
  },
  "durce-vitta": {
    systemPrompt: DURCE_SYSTEM,
    communicationRules: DURCE_COMM_RULES,
    dispatcherPrompt: DURCE_DISPATCHER,
    followupPrompt: DURCE_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clinica Odontologica Durce Vita (Odontologia Sao Paulo/SP)",
  },
  "eliane-durce-vitta": {
    systemPrompt: DURCE_SYSTEM,
    communicationRules: DURCE_COMM_RULES,
    dispatcherPrompt: DURCE_DISPATCHER,
    followupPrompt: DURCE_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Juliana — Recepcionista Clinica Odontologica Durce Vita (Odontologia Sao Paulo/SP)",
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
  "clinica-odonto-generica": {
    systemPrompt: ODONTO_SYSTEM,
    communicationRules: ODONTO_COMM_RULES,
    dispatcherPrompt: ODONTO_DISPATCHER,
    followupPrompt: ODONTO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0.0",
    description: "Recepcionista — Clínica Odontológica Genérica (Customizável)",
  },
  "imperio": {
    systemPrompt: IMPERIO_SYSTEM,
    communicationRules: IMPERIO_COMM_RULES,
    dispatcherPrompt: IMPERIO_DISPATCHER,
    followupPrompt: IMPERIO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "SDR — Autoescola Império CFC (Sorocaba/SP)",
  },
  "imperio-cfc": {
    systemPrompt: IMPERIO_SYSTEM,
    communicationRules: IMPERIO_COMM_RULES,
    dispatcherPrompt: IMPERIO_DISPATCHER,
    followupPrompt: IMPERIO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "SDR — Autoescola Império CFC (Sorocaba/SP)",
  },
  "contabilidade-ideal": {
    systemPrompt: CONTABILIDADE_IDEAL_SYSTEM,
    communicationRules: CONTABILIDADE_IDEAL_COMM_RULES,
    dispatcherPrompt: CONTABILIDADE_IDEAL_DISPATCHER,
    followupPrompt: CONTABILIDADE_IDEAL_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "Vitória — Lead Converter Contabilidade Ideal (IRPF 2026)",
  },
  "dp_contabilidade_ideal": {
    systemPrompt: CONTABILIDADE_IDEAL_SYSTEM,
    communicationRules: CONTABILIDADE_IDEAL_COMM_RULES,
    dispatcherPrompt: CONTABILIDADE_IDEAL_DISPATCHER,
    followupPrompt: CONTABILIDADE_IDEAL_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.0",
    description: "Vitória — Lead Converter Contabilidade Ideal (IRPF 2026)",
  },
  "vale-suico": {
    systemPrompt: VALE_SUICO_SYSTEM,
    communicationRules: VALE_SUICO_COMM_RULES,
    dispatcherPrompt: VALE_SUICO_DISPATCHER,
    followupPrompt: VALE_SUICO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Vitória — Vale Suíço Resort (qualificação de leads / orçamento WhatsApp)",
  },
  "vale-suico-resort": {
    systemPrompt: VALE_SUICO_SYSTEM,
    communicationRules: VALE_SUICO_COMM_RULES,
    dispatcherPrompt: VALE_SUICO_DISPATCHER,
    followupPrompt: VALE_SUICO_FOLLOWUP,
    alwaysInjectCommRules: true,
    version: "v1.2.1",
    description: "Vitória — Vale Suíço Resort (qualificação de leads / orçamento WhatsApp)",
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
  /** Quando true, usa apenas data do dia (sem hora) para maximizar cache de prompt */
  useSimplifiedDateContext?: boolean,
  /** Quando true, injeta regras genéricas de reagendar/cancelar */
  hasCalendarTool?: boolean,
  /** Serviços do tenant para injeção dinâmica no prompt */
  calendarServices?: { name: string; duration_minutes: number }[],
): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  const base = config?.systemPrompt || agentSystemPrompt || "You are a helpful AI assistant.";
  const shouldInjectComm = (hasInventoryTool && config?.communicationRules) || config?.alwaysInjectCommRules;
  const commRules = (shouldInjectComm && config?.communicationRules) ? "\n\n" + config.communicationRules : "";
  const greeting = "\n\n" + BASE_GREETING;
  const globalRules = "\n\n" + GLOBAL_CONDUCT_RULES;
  const humanization = "\n\n" + GLOBAL_HUMANIZATION;
  const shortAckRules = "\n\n" + GLOBAL_SHORT_ACK_RULES;
  const languageRules = "\n\n" + GLOBAL_LANGUAGE_RULES;

  const now = new Date();
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(tomorrowDate);

  const dateContext = useSimplifiedDateContext
    ? `\n\n[CONTEXTO TEMPORAL] Hoje: ${todayISO}. Amanhã: ${tomorrowISO}. Use como referência para "hoje", "amanhã", dias da semana, etc.`
    : (() => {
        const brasiliaFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        const nowStr = brasiliaFormatter.format(now);
        return `\n\n[CONTEXTO TEMPORAL] Agora: ${nowStr} (Brasília). Hoje: ${todayISO}. Use estas datas como referência ao falar de "hoje", "amanhã", dias da semana, etc.`;
      })();

  const petContextBlock = petContext ? `\n\n${petContext}` : "";

  // Bloco de calendário: regras genéricas + serviços do tenant
  const calendarRulesBlock = hasCalendarTool ? "\n\n" + CALENDAR_TOOL_BASE_RULES : "";
  const servicesBlock = (hasCalendarTool && calendarServices && calendarServices.length > 0)
    ? "\n\n[SERVIÇOS DA EMPRESA]\nUse estas durações ao criar agendamentos:\n" +
      calendarServices.map((s) => `- ${s.name}: ${s.duration_minutes} minutos`).join("\n")
    : "";

  return base + commRules + greeting + globalRules + humanization + shortAckRules + languageRules + dateContext + petContextBlock + calendarRulesBlock + servicesBlock;
}

// ─── Regras genéricas injetadas quando o agente tem a tool de calendário ativa ───

const CALENDAR_TOOL_BASE_RULES = `
[REGRAS DE AGENDAMENTO COM CALENDÁRIO]

OFERTA DE HORÁRIOS (OBRIGATÓRIO):
→ NUNCA liste todos os slots disponíveis. Isso transmite impressão de agenda vazia.
→ Ofereça EXATAMENTE 2 horários intercalados (não consecutivos) por vez. Ex: 09:00 e 11:00, ou 14:00 e 16:00.
→ Se restar apenas 1 slot disponível no período: ofereça somente esse.
→ Se o cliente recusar ambas as opções: pergunte qual horário seria melhor e verifique.
→ JAMAIS sugira horário fora do array retornado por check_availability — significa marcar em cima de outro cliente.

REMARCAR (cliente quer trocar de horário):
→ PASSO 1: Se o horário ATUAL do agendamento NÃO está claro no histórico → use action="listar_eventos" com client_name para LISTAR agendamentos futuros.
→ PASSO 2: Apresente os agendamentos encontrados ao cliente para confirmação.
→ PASSO 3: Confirmado qual agendamento mudar → use action="reagendar" (operação atômica — mais eficiente e seguro)
→ PASSO 4: Parâmetros: start_at (hora antiga, extraída do histórico OU do resultado de listar_eventos) + new_start_at (nova hora) + client_name
→ Uma única operação. Preserva histórico e não cobra sessão extra do pacote.

CANCELAR SEM REMARCAR:
→ Use action="cancelar"
→ Parâmetros: start_at (hora exata do agendamento) + client_name

REGRA DE DECISÃO:
→ Novo horário já informado + horário ATUAL claro no histórico → action="reagendar"
→ Horário ATUAL NÃO claro → action="listar_eventos" ANTES de tudo
→ Só cancelar (sem novo horário) → action="cancelar"
→ Quer remarcar mas não sabe o novo horário → use action="listar_eventos"; confirme qual; depois pergunte novo horário; depois action="criar"

COLETA DE DADOS OBRIGATÓRIA (action="criar"):
→ Verifique se tem o NOME COMPLETO do cliente. Se apenas o primeiro nome foi fornecido, pergunte o sobrenome antes de agendar. **POREM**, se o cliente já forneceu o nome completo em qualquer mensagem anterior, use esse nome — NÃO solicite novamente.
→ O título do evento DEVE conter o nome completo: "[Nome Completo] — [Motivo]".
→ Isso garante que listar_eventos encontrará o evento futuramente quando o cliente quiser remarcar/cancelar.
`.trim();

const CALENDAR_DISPATCHER_RULES = `
CALENDAR — BOOKING (action="criar"):
  When confirming an appointment, ALWAYS pass procedure_type and duration_minutes if a service was mentioned.
  → Call: consultar_agenda(action="criar", title="[Name] — [Service]", start_at="...", procedure_type="[service name]", duration_minutes=[minutes from service list])
  → duration_minutes MUST come from [SERVIÇOS DA EMPRESA] list. If the service is "Limpeza" and the list says "Limpeza: 45 minutos", pass duration_minutes=45.
  → If the service is not in the list, omit duration_minutes (backend will use default).
  → NEVER use duration_minutes=60 as default if a specific service was mentioned — look it up in [SERVIÇOS DA EMPRESA].

CALENDAR — LISTING EVENTS (action="listar_eventos", FIRST STEP):
  Trigger: "remarcar", "reagendar", "trocar horário", "mudar data", "trocar de dia", "preciso mudar o horário" OR "cancelar", "desmarcar"
  WHEN: The exact date+time (start_at) of the existing appointment is NOT found in the conversation history.
  → Call: consultar_agenda(action="listar_eventos", client_name="[patient name]")
  → The conversational model will present found events and ask for confirmation.
  → DO NOT use this if start_at is explicitly mentioned (e.g., "cancelar a consulta de terça as 09:00").

CALENDAR — RESCHEDULING (action="reagendar", PREFERRED):
  Trigger: "remarcar", "reagendar", "trocar horário", "mudar data", "trocar de dia", "preciso mudar o horário"
  AND the customer has already provided a new date/time in the same message or context.
  AND the old appointment's exact date/time (start_at) is found in the conversation history.
  → Call: consultar_agenda(action="reagendar", start_at="[old ISO datetime]", new_start_at="[new ISO datetime]", client_name="[name]")
  Extract old appointment from conversation history (look for confirmed bookings in assistant messages).

CALENDAR — CANCELLATION ONLY (action="cancelar"):
  Trigger: "cancelar", "desmarcar", "não vou poder", "tive imprevisto", "não consigo ir"
  OR rescheduling intent WITHOUT a new time provided.
  AND the exact date+time of the appointment IS found in conversation history.
  → Call: consultar_agenda(action="cancelar", start_at="[exact ISO datetime]", client_name="[name]")
  If start_at is unknown → use listar_eventos first.

RULE:
- "remarcar para [horário]" + start_at known → reagendar
- "remarcar" + start_at unknown → listar_eventos
- "cancelar" + start_at unknown → listar_eventos`.trim();

/**
 * Retorna o dispatcher prompt para um tenant.
 */
export function getDispatcherPrompt(tenantSlug: string | null, hasCalendarTool?: boolean): string {
  const config = tenantSlug ? TENANT_PROMPTS[tenantSlug] : undefined;
  const base = config?.dispatcherPrompt || DEFAULT_DISPATCHER_PROMPT;
  const calendarDispatch = hasCalendarTool ? "\n\n" + CALENDAR_DISPATCHER_RULES : "";
  return base + calendarDispatch;
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
