import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { msgLog } from "../utils/flow-logger.js";
import { transcribeAudio, isAudioAttachment } from "../services/transcribe.js";
import { extractDocument, formatExtractedForMessage, isImageOrPdfAttachment } from "../services/extractDocument.js";
import { buildSystemPrompt, getDispatcherPrompt } from "../services/prompts/registry.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";
import { filterCommandLinesFromStream, sanitizeLLMOutput, fallbackSanitizeForRetry, restorePortugueseAccents } from "../utils/sanitize.js";
import { buildPetGenderContext } from "../utils/petGenderByName.js";
import {
  formatDateBR,
  buildFallbackAgendaNotification,
  buildCancelNotification,
  buildRescheduleNotification,
  buildHandoffNotification,
  extractClientNameFromMessages,
  userHasProvidedNameInMessages,
  toBrasiliaISO,
  resolveHandoffPhone,
  isPhoneLikeDigits,
  containsInstitutionNameToken,
  isBlockedAsName,
} from "../utils/agendaNotification.js";
import { sendNotificationToGroup } from "../utils/sendNotification.js";

const MSG_SPLIT = "<<MSG_SPLIT>>";
const MAX_TOOL_ITERATIONS = 5;
/** Quantidade de mensagens user/assistant no retry quando resposta vazia (evita reinício genérico da conversa) */
const RETRY_CONTEXT_MESSAGE_LIMIT = 12;

/** Mensagem amigável quando a API do provedor (OpenAI/Gemini) retorna erro HTTP */
function providerErrorMessage(status: number, errText: string): string {
  const preview = errText.slice(0, 200).replace(/\s+/g, " ").trim();
  if (status === 401) return "API key inválida ou expirada (401). Verifique o provedor em Provedores e atualize a chave.";
  if (status === 403) return "Acesso negado pelo provedor de IA (403). Verifique a API key e permissões em Provedores.";
  if (status === 429) return "Limite de uso do provedor excedido (429). Tente mais tarde ou verifique o plano/créditos.";
  if (status >= 500) return `Erro interno do provedor (${status}). Tente novamente em alguns minutos.`;
  return preview || `Erro do provedor (${status}). Verifique a API key em Provedores.`;
}

/** Guard: detecta se o LLM está ecoando a mensagem do cliente (ex: "👍" → "👍") */
function isEchoResponse(response: string, lastUserMessage: string | null | undefined): boolean {
  if (!lastUserMessage || lastUserMessage.length === 0) return false;
  if (lastUserMessage.length > 30) return false; // só checar mensagens curtas
  const normalized = response.trim().toLowerCase();
  const userNormalized = lastUserMessage.trim().toLowerCase();
  return normalized === userNormalized && normalized.length > 0;
}

/** Guard: detecta respostas com emojis ou caracteres especiais excessivamente repetidos (ex: "💔💔💔...") */
function isRepeatedEmojiResponse(response: string): boolean {
  if (!response || response.length < 3) return false;

  // Remover espaços e quebras de linha para análise
  const trimmed = response.trim().replace(/\s+/g, '');

  // Se a resposta tem mais de 80% de caracteres repetidos ou emojis, é suspeita
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const emojiMatches = trimmed.match(emojiRegex) || [];

  // Se tem muitos emojis (mais de 50% do conteúdo), descartar
  if (emojiMatches.length > trimmed.length * 0.5 && trimmed.length > 5) {
    console.warn("[Chat-Local] Resposta rejeitada: muitos emojis (", emojiMatches.length, "de", trimmed.length, ")");
    return true;
  }

  // Detectar caracteres muito repetidos (ex: "💔💔💔💔💔")
  for (let i = 0; i < trimmed.length - 2; i++) {
    const char = trimmed[i];
    let repeatCount = 1;
    while (i + repeatCount < trimmed.length && trimmed[i + repeatCount] === char) {
      repeatCount++;
    }
    // Se um caractere se repete mais de 5 vezes consecutivas, é spam
    if (repeatCount > 5) {
      console.warn("[Chat-Local] Resposta rejeitada: caractere repetido", char, "x", repeatCount);
      return true;
    }
  }

  return false;
}

async function getProviderApiKey(
  providerId: string | null,
  supabase: ReturnType<typeof createNexusClient>
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (providerId) {
    const { data: provider } = await supabase
      .from("providers")
      .select("base_url, api_key_encrypted")
      .eq("id", providerId)
      .single();

    if (provider) {
      let apiKey = "";
      const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
      if (provider.api_key_encrypted && encryptionKey) {
        try {
          const { decrypt } = await import("../services/crypto.js");
          apiKey = await decrypt(provider.api_key_encrypted, encryptionKey);
        } catch (err) {
          const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
          apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
          if (apiKey) {
            msgLog.decryptFallback(providerId);
          } else {
            console.error("[Chat-Local] Falha ao descriptografar chave do provider:", providerId, err);
          }
        }
      } else {
        const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
        apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
      }
      const baseUrl = (provider.base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
      if (apiKey) return { apiKey, baseUrl };
    }
  }

  if (openaiKey) {
    return { apiKey: openaiKey, baseUrl: "https://api.openai.com/v1" };
  }
  if (geminiKey) {
    return { apiKey: geminiKey, baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  return null;
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Array<{ role: "system" | "user" | "assistant"; content: string } | { role: "assistant"; content: string; tool_calls: unknown[] } | { role: "tool"; tool_call_id: string; content: string }> {
  const result: Array<{ role: "system" | "user" | "assistant"; content: string } | { role: "assistant"; content: string; tool_calls: unknown[] } | { role: "tool"; tool_call_id: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    const role = m.role === "system" ? "user" : m.role;
    if (role === "user" || role === "assistant") {
      result.push({ role, content: m.content || "" });
    }
  }
  return result;
}

// ── Entity extraction helpers ──────────────────────────────────────────────

const KNOWN_BRANDS: Record<string, string> = {
  chevrolet: "Chevrolet", chevy: "Chevrolet", gm: "Chevrolet",
  volkswagen: "Volkswagen", vw: "Volkswagen",
  fiat: "Fiat", ford: "Ford", honda: "Honda",
  hyundai: "Hyundai", toyota: "Toyota", renault: "Renault",
  nissan: "Nissan", jeep: "Jeep", mitsubishi: "Mitsubishi",
  peugeot: "Peugeot", citroen: "Citroën", kia: "Kia",
  bmw: "BMW", "mercedes-benz": "Mercedes-Benz", mercedes: "Mercedes-Benz",
  audi: "Audi", volvo: "Volvo", porsche: "Porsche",
  land: "Land Rover", range: "Range Rover", jaguar: "Jaguar",
  subaru: "Subaru", suzuki: "Suzuki", chery: "Chery",
  caoa: "CAOA Chery", byd: "BYD", ram: "RAM", dodge: "Dodge",
  mini: "Mini", lexus: "Lexus", alfa: "Alfa Romeo",
};

/** Modelos conhecidos que implicam marca (cliente pode citar só o modelo, ex: "Siena"). Ordenado por tamanho decrescente para priorizar match mais longo (ex: "grand siena"). */
const KNOWN_MODELS_TO_BRAND: Array<{ key: string; modelo: string; marca: string }> = [
  { key: "grand siena", modelo: "Grand Siena", marca: "Fiat" },
  { key: "siena", modelo: "Siena", marca: "Fiat" },
  { key: "palio", modelo: "Palio", marca: "Fiat" },
  { key: "uno", modelo: "Uno", marca: "Fiat" },
  { key: "strada", modelo: "Strada", marca: "Fiat" },
  { key: "corolla", modelo: "Corolla", marca: "Toyota" },
  { key: "hilux", modelo: "Hilux", marca: "Toyota" },
  { key: "onix", modelo: "Onix", marca: "Chevrolet" },
  { key: "cruze", modelo: "Cruze", marca: "Chevrolet" },
  { key: "tracker", modelo: "Tracker", marca: "Chevrolet" },
  { key: "civic", modelo: "Civic", marca: "Honda" },
  { key: "hb20", modelo: "HB20", marca: "Hyundai" },
  { key: "creta", modelo: "Creta", marca: "Hyundai" },
  { key: "virtus", modelo: "Virtus", marca: "Volkswagen" },
  { key: "gol", modelo: "Gol", marca: "Volkswagen" },
  { key: "t-cross", modelo: "T-Cross", marca: "Volkswagen" },
  { key: "taos", modelo: "Taos", marca: "Volkswagen" },
  { key: "s10", modelo: "S10", marca: "Chevrolet" },
  { key: "compass", modelo: "Compass", marca: "Jeep" },
  { key: "renegade", modelo: "Renegade", marca: "Jeep" },
  { key: "q5", modelo: "Q5", marca: "Audi" },
  { key: "a3", modelo: "A3", marca: "Audi" },
  { key: "320i", modelo: "320i", marca: "BMW" },
];

interface ExtractedEntities {
  marca?: string;
  modelo?: string;
  ano?: number;
  km?: string;
}

function extractVehicleEntities(text: string): ExtractedEntities {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const result: ExtractedEntities = {};

  for (const [key, brand] of Object.entries(KNOWN_BRANDS)) {
    const idx = lower.indexOf(key);
    if (idx !== -1) {
      result.marca = brand;
      const afterBrand = text.slice(idx + key.length).trim();
      const modelMatch = afterBrand.match(/^[\s]*([A-Za-zÀ-ÿ0-9]+(?:[\s]+[A-Za-zÀ-ÿ0-9]+)?)/i);
      if (modelMatch) {
        const raw = modelMatch[1].trim();
        const yearTest = /^(19|20)\d{2}$/.test(raw);
        if (!yearTest && raw.length > 1) result.modelo = raw;
      }
      break;
    }
  }

  // Se não encontrou marca/modelo por marca explícita, tenta reconhecer modelo conhecido (ex: "Siena", "vim pelo Siena")
  if (!result.modelo || !result.marca) {
    for (const { key, modelo, marca } of KNOWN_MODELS_TO_BRAND) {
      const wordBoundary = new RegExp(`(?:^|[^a-zà-ÿ0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-zà-ÿ0-9]|$)`, "i");
      if (wordBoundary.test(lower)) {
        result.modelo = modelo;
        if (!result.marca) result.marca = marca;
        break;
      }
    }
  }

  const yearMatch = text.match(/\b(19\d{2}|20[0-3]\d)\b/);
  if (yearMatch) result.ano = parseInt(yearMatch[1], 10);

  const kmMatch = text.match(/(\d[\d.]*)\s*(?:mil\s*)?km/i);
  if (kmMatch) result.km = kmMatch[1].replace(/\./g, "");

  return result;
}

/** Formata valor em reais no padrão brasileiro (ex.: R$ 127.900,00). */
function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Converte resultado bruto de tool (JSON) em texto natural para o LLM conversacional. */
function summarizeToolResult(obj: Record<string, unknown>): string {
  if (obj.error && typeof obj.error === "string") {
    const err = obj.error;
    const isPastDate = /passado|no passado|past/i.test(err);
    if (isPastDate) {
      return `Erro ao agendar: ${err}\n\nIMPORTANTE: O agendamento NÃO foi realizado. NUNCA confirme ao cliente que o horário foi reservado. Se o cliente pediu horário para "amanhã", use a data de AMANHÃ em start_at (não a de hoje). Corrija o start_at e chame novamente a ferramenta consultar_agenda com action "criar".`;
    }
    return `Erro: ${err}\n\nO agendamento NÃO foi feito. NÃO confirme ao cliente. CRÍTICO: NÃO invente horários alternativos — você não sabe quais estão disponíveis agora. Informe ao cliente que aquele horário não está disponível e que irá verificar as opções. Não sugira nenhum horário específico sem antes consultar a agenda novamente.`;
  }
  const action = obj.action as string | undefined;
  if (action === "check_availability") {
    const slots = obj.available_slots as Record<string, string[]> | undefined;
    if (!slots || Object.keys(slots).length === 0) {
      return "Nenhum horário disponível no período consultado.";
    }
    const parts: string[] = [];
    for (const [dateStr, times] of Object.entries(slots)) {
      if (times && times.length > 0) {
        const d = dateStr.split("-");
        const brDate = d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : dateStr;
        parts.push(`${brDate}: ${times.join(", ")}`);
      }
    }
    return parts.length > 0
      ? `Horários disponíveis:\n${parts.join("\n")}\n\nREGRA CRÍTICA: Estes são os ÚNICOS horários livres. NÃO sugira nenhum horário fora desta lista — qualquer outro está OCUPADO. Ofereça apenas horários presentes nesta lista para a data que o cliente pediu.`
      : "Nenhum horário disponível.";
  }
  if (action === "created" || action === "create") {
    const ev = obj.event as { start_at?: string; title?: string } | undefined;
    if (ev?.start_at) {
      const formatted = formatDateBR(ev.start_at);
      const parts = formatted.split(", ");
      const date = parts[1] ?? ev.start_at.slice(0, 10).split("-").reverse().join("/");
      const time = parts[2] ?? ev.start_at.slice(11, 16);
      return `Agendamento confirmado para ${date} às ${time}.`;
    }
    return "Agendamento confirmado com sucesso.";
  }
  if (action === "cancelled" || action === "cancel") {
    return "Agendamento cancelado.";
  }
  // consultar_estoque: incluir resumo dos veículos E photos_markdown para o LLM poder enviar as fotos
  const vehicles = obj.vehicles as Array<{ id?: string; nome_completo?: string; ano?: number; preco?: number; preco_formatado?: string; km?: number; cor?: string; photos_markdown?: string; video_details?: string | null }> | undefined;
  const photosMarkdown = obj.photos_markdown as string | undefined;
  if (Array.isArray(vehicles) && vehicles.length > 0) {
    const lines: string[] = [];
    lines.push(`ESTOQUE ATUAL (${vehicles.length} veículo(s)):`);
    for (const v of vehicles.slice(0, 10)) {
      const precoStr = v.preco_formatado ?? (v.preco != null ? formatCurrencyBR(v.preco) : null);
      const parts = [v.nome_completo, v.ano, v.km != null ? `${v.km} km` : null, precoStr, v.cor].filter(Boolean);
      lines.push("- " + parts.join(", "));
    }
    if (vehicles.length > 10) lines.push(`... e mais ${vehicles.length - 10} veículo(s).`);
    const withPerVehiclePhotos = vehicles.some((v) => v.photos_markdown && v.photos_markdown.trim());
    if (withPerVehiclePhotos) {
      lines.push("");
      lines.push("FOTOS DISPONÍVEIS — quando o cliente pedir ou aceitar ver fotos, use OBRIGATORIAMENTE o comando abaixo na PRIMEIRA linha da resposta:");
      for (const v of vehicles) {
        if (v.photos_markdown && v.photos_markdown.trim()) {
          lines.push(`  → ENVIAR_FOTOS_VEICULO: ${v.nome_completo ?? "?"} | id: ${v.id ?? "?"}`);
        }
      }
    } else if (photosMarkdown && photosMarkdown.trim()) {
      lines.push("");
      lines.push("FOTOS DISPONÍVEIS — quando o cliente pedir ou aceitar ver fotos, use o comando na PRIMEIRA linha: ENVIAR_FOTOS_VEICULO: nome do veículo | id: uuid (se houver id disponível no estoque)");
    }
    const withVideoDetails = vehicles.some((v) => v.video_details && v.video_details.trim());
    if (withVideoDetails) {
      lines.push("");
      lines.push("VÍDEO DETALHADO (quando o cliente pedir vídeo do carro, tour virtual, etc., use ENVIAR_VIDEO_DETALHES: nome do veículo | id: uuid):");
      for (const v of vehicles) {
        if (v.video_details && v.video_details.trim()) {
          lines.push(`- ${v.nome_completo ?? "?"} (id: ${v.id ?? "?"}) — tem vídeo`);
        }
      }
    }
    return lines.join("\n");
  }
  if (Array.isArray(obj.data) && obj.data.length > 0) {
    const items = obj.data as Array<{ brand?: string; model?: string; year?: number; price?: number }>;
    const preview = items.slice(0, 5).map((v) => {
      const parts = [v.brand, v.model, v.year].filter(Boolean);
      return parts.join(" ");
    });
    return `Encontrados ${items.length} veículo(s): ${preview.join("; ")}${items.length > 5 ? "..." : ""}`;
  }
  return JSON.stringify(obj).slice(0, 300);
}

function isAppraisalContext(messages: Array<{ role: string; content: string }>): boolean {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return false;
  const lower = lastAssistant.content.toLowerCase();
  return (
    (lower.includes("marca") && lower.includes("modelo")) ||
    lower.includes("quilometragem") ||
    lower.includes("avalia") ||
    lower.includes("pre-avalia") ||
    lower.includes("detalhes do seu carro") ||
    lower.includes("dados do seu")
  );
}

/** Extrai CEP do texto (8 dígitos, formato 12345-678 ou 12345678). Retorna o último encontrado (mais recente na conversa) ou null. */
function extractCepFromText(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const matches = [...text.replace(/\s+/g, " ").trim().matchAll(/\b(\d{5}-?\d{3})\b/g)];
  if (matches.length === 0) return null;
  const lastMatch = matches[matches.length - 1];
  const digits = lastMatch[1].replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

/** Mapa de aliases de unidade → nome canônico para Autoescola Ideal (chatwoot_assign reason). */
const IDEAL_UNITS_MAP: Record<string, string> = {
  coop: "Coop Zona Norte",
  "zona norte": "Coop Zona Norte",
  "vila haro": "Vila Haro",
  "vila helena": "Vila Helena",
  "júlio de mesquita": "Júlio de Mesquita",
  julio: "Júlio de Mesquita",
  "julio de mesquita": "Júlio de Mesquita",
  jm: "Júlio de Mesquita",
  aparecidinha: "Aparecidinha",
  aparecida: "Aparecidinha",
  centro: "Centro",
};

/**
 * Constrói hint para marcar_lead quando cliente demonstra interesse e ainda não é cliente.
 * Usado em dual e single-provider para garantir etiquetagem consistente de novos leads.
 */
function buildLeadHint(
  messages: Array<{ role: string; content: string }>,
  leadLabelEnabled: boolean
): string {
  if (!leadLabelEnabled) return "";
  const fullText = messages.map((m) => (m.content ?? "")).join(" ").toLowerCase();
  const hasInterest =
    /\b(interesse|quero\s+saber|quero\s+tirar|gostaria\s+de\s+informa|tenho\s+interesse|como\s+funciona|quero\s+informa|preciso\s+de\s+informa|quero\s+cnh|tirar\s+cnh|primeira\s+habilita)\b/i.test(fullText);
  const isExistingCustomer =
    /\b(j[áa]\s+[ée]sou?\s+aluno|estou\s+matriculado|sou\s+aluno|j[áa]\s+[ée]s\s+cliente)\b/i.test(fullText) ||
    (/\bj[áa]\s+[ée]\s+aluno\s+da\s+ideal\??/i.test(fullText) && /\b(sim|sou|estou)\b/i.test(fullText));
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userShowsInterest = lastUserMsg?.content && /\b(interesse|quero|gostaria|como\s+funciona|informa|cnh)\b/i.test(lastUserMsg.content);
  if (hasInterest && !isExistingCustomer && (userShowsInterest || messages.length <= 4)) {
    return `\n\n[NOVO LEAD DETECTADO. OBRIGATÓRIO: chame marcar_lead para etiquetar o contato como lead do dia. O cliente demonstrou interesse e ainda não é aluno/cliente. NÃO retorne NO_TOOLS_NEEDED.]`;
  }
  return "";
}

/**
 * Constrói hint obrigatório para atribuir_agente quando Autoescola Ideal deve transferir.
 * Usado em dual (dispatcher) e single-provider para garantir chamada consistente da tool.
 */
function buildAutoescolaIdealAssignHint(
  messages: Array<{ role: string; content: string }>,
  hasAssignTool: boolean,
  tenantSlug: string | null
): string {
  const isAutoescolaIdeal = tenantSlug === "ideal" || tenantSlug === "autoescola-ideal" || tenantSlug === "auto-escola-ideal";
  if (!hasAssignTool || !isAutoescolaIdeal) return "";

  const lastAsst = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUsr = [...messages].reverse().find((m) => m.role === "user");
  const fullConvText = messages.map((m) => (m.content ?? "")).join(" ");
  const convLower = fullConvText.toLowerCase();

  // Path 1: Resumo confirmado — Unidade de preferência: + pergunta de confirmação (ampliada)
  const summaryHasUnit =
    lastAsst?.content &&
    /Unidade de preferência:/i.test(lastAsst.content) &&
    /(Está tudo correto|tudo certo|confere|pode confirmar|confirma|está ok)\s*\??/i.test(lastAsst.content);
  const userTrim = lastUsr?.content?.trim() || "";
  const userConfirms =
    userTrim &&
    userTrim.length < 160 &&
    /\b(sim|ok|está certo|tudo certo|confirmo|pode ser|perfeito|legal|beleza|bora|vamos|quero|fechado|tá certo|está ok|pode seguir|tudo ok|isso mesmo|certinho|confirmado|manda|fechou|pode encaminhar)\b/i.test(userTrim);

  if (summaryHasUnit && userConfirms && lastAsst?.content) {
    const unitMatch = lastAsst.content.match(/Unidade de preferência:\s*(.+?)(?:\n|$)/i);
    const unitName = unitMatch?.[1]?.trim();
    if (unitName) {
      return `\n\n[RESUMO CONFIRMADO. OBRIGATÓRIO: chame atribuir_agente/chatwoot_assign com reason="${unitName}" para transferir ao time da unidade mais próxima da residência do cliente. NÃO retorne NO_TOOLS_NEEDED.]`;
    }
  }

  // Path 2: Aluno existente — assistente disse que vai encaminhar/transferir (frases ampliadas)
  const forwardPhrases = /encaminhar|time da unidade|encaminho|transferir|passo para|equipe da unidade|redirecion|vou passar/i;
  if (lastAsst?.content && forwardPhrases.test(lastAsst.content)) {
    for (const [key, canonical] of Object.entries(IDEAL_UNITS_MAP)) {
      if (convLower.includes(key)) {
        return `\n\n[ALUNO EXISTENTE — ENCAMINHAMENTO. O assistente disse que vai encaminhar para o time da unidade. OBRIGATÓRIO: chame atribuir_agente/chatwoot_assign com reason="${canonical}" para transferir ao time da unidade. NÃO retorne NO_TOOLS_NEEDED. NÃO chame consultar_cep nem nearest_unit.]`;
      }
    }
  }

  // Path 3: Cliente mencionou uma unidade específica + contexto de aluno (aula, horário, tolerância)
  // Detecta quando o cliente menciona uma unidade + frases de aluno sem o agente ter respondido com "encaminhar" ainda
  const isStudentContext = /aula|horário|tolerância|tempo de toler|chegar na aula|atraso|chegar a tempo/i.test(convLower);
  if (isStudentContext && lastUsr?.content) {
    for (const [key, canonical] of Object.entries(IDEAL_UNITS_MAP)) {
      if (convLower.includes(key)) {
        return `\n\n[ALUNO EM SITUAÇÃO DE AULA — UNIDADE DETECTADA. Cliente mencionou unidade "${canonical}" em contexto de aula/horário. OBRIGATÓRIO: chame atribuir_agente/chatwoot_assign com reason="${canonical}" para transferir ao time da unidade correta. NÃO retorne NO_TOOLS_NEEDED.]`;
      }
    }
  }

  return "";
}

/**
 * Retorna true se o modelo Gemini suporta thinking (budget de raciocínio).
 * Gemini 2.5+ tem thinking nativo. Requer temperature=1.0.
 */
function isGeminiThinkingModel(model: string): boolean {
  return /^gemini-2\.5-/i.test(model);
}

/**
 * Sanitiza nome de função para OpenAI e Gemini.
 * OpenAI exige: ^[a-zA-Z0-9_-]+$
 * Gemini exige: ^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$
 * Sempre sanitizar para evitar rejeição (ex: enviar_notificação -> enviar_notificacao).
 */
function sanitizeFunctionName(name: string, _baseUrl: string): string {
  let s = String(name || "tool").trim();
  // Remover acentos (NFD: ç -> c + combining cedilla)
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Substituir caracteres inválidos por underscore (OpenAI: apenas a-zA-Z0-9_-)
  s = s.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Remover underscores consecutivos
  s = s.replace(/_+/g, "_");
  // Garantir que começa com letra ou underscore
  if (s && !/^[a-zA-Z_]/.test(s)) s = "_" + s;
  // Remover trailing underscores
  s = s.replace(/_+$/, "");
  if (!s) s = "tool";
  return s.slice(0, 64);
}

const DEFAULT_PARAMS_SCHEMA = { type: "object", properties: {}, required: [] } as const;

const NOTIFICATION_SYSTEM_PROMPT = `Voce monta uma unica mensagem de notificacao interna para a equipe. Inclua obrigatoriamente:
- Nome do cliente
- Telefone
- Data e horario do agendamento SEMPRE no padrao brasileiro: DD/MM/AAAA, HH:MM (ex: 09/03/2026, 15:00). NUNCA use MM/DD/AAAA.
- Veiculo de interesse
Se o historico ajudar, inclua um resumo muito breve da conversa (1 linha). Termine com "Agendado automaticamente pela IA". Seja conciso e organizado. Nao use markdown. Responda APENAS com o texto da notificacao, sem explicacoes.`;

/**
 * Chama a LLM para montar a notificacao de agendamento com historico.
 * Retorna o texto gerado ou null em caso de erro (usar fallback).
 */
async function buildNotificationWithLLM(
  agent: { provider_id?: string | null; model?: string | null },
  payload: { title: string; start_at: string; telefone_cliente?: string; veiculo_interesse?: string },
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const supabase = createNexusClient();
  const providerConfig = await getProviderApiKey(agent.provider_id ?? null, supabase);
  if (!providerConfig?.apiKey) return null;

  const dataHoraBR = formatDateBR(payload.start_at);
  // #region agent log
  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ad5eb6'},body:JSON.stringify({sessionId:'ad5eb6',location:'chat-local.ts:buildNotificationWithLLM',message:'dataHoraBR formatado',data:{startAtOriginal:payload.start_at,dataHoraBR},timestamp:Date.now(),hypothesisId:'H_LLM_INPUT'})}).catch(()=>{});
  // #endregion
  const historyText = messages
    .slice(-20)
    .map((m) => `${m.role === "user" ? "Cliente" : "Assistente"}: ${(m.content || "").slice(0, 300)}`)
    .join("\n");

  const userContent = `Dados do agendamento:
- Titulo: ${payload.title}
- Data/hora (BR): ${dataHoraBR || payload.start_at}
- Telefone: ${payload.telefone_cliente || "(nao informado)"}
- Veiculo de interesse: ${payload.veiculo_interesse || "(nao informado)"}

Historico (ultimas mensagens):
${historyText || "(vazio)"}

Gere a notificacao organizada.`;
  // #region agent log
  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ad5eb6'},body:JSON.stringify({sessionId:'ad5eb6',location:'chat-local.ts:buildNotificationWithLLM:userContent',message:'userContent enviado para LLM',data:{userContentPreview:userContent.slice(0,400)},timestamp:Date.now(),hypothesisId:'H_LLM_PROMPT'})}).catch(()=>{});
  // #endregion

  const isGemini = /generativelanguage|googleapis\.com/i.test(providerConfig.baseUrl);
  const model = isGemini ? "gemini-2.0-flash" : "gpt-4o-mini";
  const baseUrl = providerConfig.baseUrl.replace(/\/+$/, "");
  const apiUrl = isGemini && !baseUrl.includes("/openai")
    ? `${baseUrl}/openai/chat/completions`
    : `${baseUrl}/chat/completions`;

  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: NOTIFICATION_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.warn("[Chat-Local] buildNotificationWithLLM falhou:", resp.status, await resp.text().catch(() => ""));
      return null;
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return text;
  } catch (e) {
    console.warn("[Chat-Local] buildNotificationWithLLM erro:", (e as Error)?.message);
    return null;
  }
}

/**
 * Dispara notificação automática via tool enviar_notificacao após criar/cancelar agendamento.
 * Busca a tool send_notification vinculada ao agente e usa a config dela (conversation_id do grupo).
 * Sempre usa fallback com formato BR (DD/MM/AAAA HH:MM), telefone e veículo.
 * 
 * Também agenda lembrete em appointment_reminders se reminder_enabled.
 */
async function sendAgendaNotification(
  agentId: string,
  agent: { config?: Record<string, unknown>; tenant_id?: string },
  toolResult: unknown,
  messages?: Array<{ role: string; content: string }>,
  externalUserId?: string | null,
  conversationId?: string | null,
  chatwootConvId?: number | null
): Promise<void> {
  if (!toolResult || typeof toolResult !== "object") return;
  const res = toolResult as {
    action?: string;
    event?: { id?: string; title?: string; start_at?: string };
    deleted_event?: { title?: string; start_at?: string };
    old_start_at?: string;
    telefone_cliente?: string;
    veiculo_interesse?: string;
  };
  const isCreated = res.action === "created" && res.event;
  const isCancelled = res.action === "cancelled" && res.deleted_event;
  const isRescheduled = res.action === "rescheduled" && res.event;
  if (!isCreated && !isCancelled && !isRescheduled) return;

  const evt = isCreated ? res.event! : isCancelled ? res.deleted_event! : res.event!;
  const title = evt.title || "Agendamento";
  const startAt = evt.start_at || "";
  // #region agent log
  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ad5eb6'},body:JSON.stringify({sessionId:'ad5eb6',location:'chat-local.ts:sendAgendaNotification',message:'start_at do evento antes de formatDateBR',data:{isCreated,isCancelled,isRescheduled,startAt,startAtLength:startAt.length,hasOffset:!!startAt.match(/[+-]\d{2}:?\d{2}$/),hasZ:startAt.endsWith('Z')},timestamp:Date.now(),hypothesisId:'H_TIMEZONE'})}).catch(()=>{});
  // #endregion
  const dataHoraBR = formatDateBR(startAt);

  let message: string;
  if (isCreated) {
    const telefone = res.telefone_cliente?.trim() || externalUserId?.trim() || undefined;
    message = buildFallbackAgendaNotification(
      title,
      startAt,
      telefone,
      res.veiculo_interesse,
      messages
    );
  } else if (isRescheduled) {
    const oldStartAt = res.old_start_at || "";
    message = buildRescheduleNotification(title, oldStartAt, startAt);
  } else {
    message = buildCancelNotification(title, startAt);
  }

  const supabase = createNexusClient();

  // Agendar lembrete se reminder_enabled
  if (isCreated && res.event?.id && conversationId) {
    const cfg = (agent.config || {}) as Record<string, unknown>;
    const reminderEnabled = cfg.reminder_enabled as boolean;
    const reminderMinutesBefore = (cfg.reminder_minutes_before as number) || 60;

    if (reminderEnabled && startAt) {
      try {
        const { data: existingReminder } = await supabase
          .from("appointment_reminders")
          .select("id")
          .eq("calendar_event_id", res.event.id)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();
        if (existingReminder) {
          console.log("[Chat-Local] Lembrete já existente para evento", res.event.id);
        } else {
          const eventStartAtBR = toBrasiliaISO(startAt);
          const eventStartDate = new Date(eventStartAtBR);
          const remindAt = new Date(eventStartDate.getTime() - reminderMinutesBefore * 60 * 1000);

          await supabase.from("appointment_reminders").insert({
            agent_id: agentId,
            tenant_id: agent.tenant_id,
            calendar_event_id: res.event.id,
            conversation_id: conversationId,
            external_user_id: externalUserId || "",
            chatwoot_conversation_id: chatwootConvId ?? null,
            event_title: title,
            event_start_at: eventStartAtBR,
            remind_at: remindAt.toISOString(),
            status: "pending",
          });

          console.log(`[Chat-Local] Lembrete agendado para ${remindAt.toISOString()} (${reminderMinutesBefore} min antes)`);
        }
      } catch (e) {
        console.warn("[Chat-Local] Erro ao agendar lembrete:", (e as Error)?.message);
      }
    }
  }

  await sendNotificationToGroup(agentId, message);
}

/**
 * Dispara notificação de handoff (cliente aguardando atendimento) quando o assistente usa HANDOFF_COMERCIAL.
 * Mesmo padrão do agendamento: nome, telefone, veículo de interesse.
 */
function isEnviarNotificacaoTool(tool: ToolDef): boolean {
  if (tool.tool_type === "send_notification") return true;
  const fnName = (tool.function_def as Record<string, unknown>)?.name as string;
  return /enviar[_ ]?notific(a|a[cç])[oõ]a?/i.test(fnName || "");
}

/** Sobrescreve args do modelo com nome/telefone inferidos do histórico quando o valor enviado é inválido. */
function enrichEnviarNotificacaoArgs(
  messages: Array<{ role: string; content: string }>,
  externalUserId: string | null | undefined,
  args: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...args };
  const extractedName = extractClientNameFromMessages(messages);
  const resolvedPhone = resolveHandoffPhone(externalUserId, messages);
  const nome = String(out.nome ?? out.nome_cliente ?? out.name ?? "").trim();
  const nomeRuim =
    !nome ||
    /^cliente$/i.test(nome) ||
    isBlockedAsName(nome) ||
    containsInstitutionNameToken(nome);
  if (nomeRuim) {
    const n = extractedName ?? "";
    out.nome = n;
    out.nome_cliente = n;
    out.name = n;
  }
  const tel = String(out.telefone ?? out.telefone_cliente ?? out.phone ?? out.numero ?? "").trim();
  const telRuim = !tel || !isPhoneLikeDigits(tel);
  if (telRuim && resolvedPhone) {
    out.telefone = resolvedPhone;
    out.telefone_cliente = resolvedPhone;
    out.phone = resolvedPhone;
    out.numero = resolvedPhone;
  }
  return out;
}

async function sendHandoffNotification(
  agentId: string,
  agent: { config?: Record<string, unknown>; tenant_id?: string },
  messages: Array<{ role: string; content: string }>,
  externalUserId?: string | null
): Promise<void> {
  const nomeCliente = extractClientNameFromMessages(messages) ?? "";
  const telefoneHandoff = resolveHandoffPhone(externalUserId, messages);
  const message = buildHandoffNotification(nomeCliente, telefoneHandoff, undefined, messages);
  await sendNotificationToGroup(agentId, message);
}

function normalizeParametersSchema(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object") return { ...DEFAULT_PARAMS_SCHEMA };
  const p = params as Record<string, unknown>;
  if (p.type !== "object") return { ...DEFAULT_PARAMS_SCHEMA };
  return {
    type: "object",
    properties: (p.properties && typeof p.properties === "object") ? p.properties : {},
    required: Array.isArray(p.required) ? p.required : [],
  };
}

export function enrichChatwootAssignDescription(tool: ToolDef, baseDescription: string): string {
  if (tool.tool_type !== "chatwoot_assign") return baseDescription;

  const execCfg = (tool.execution_config || {}) as Record<string, unknown>;
  const rules = Array.isArray(execCfg.rules)
    ? (execCfg.rules as Array<{ label?: string }>)
    : [];

  const labeledRules = rules.filter(
    (r) => typeof r.label === "string" && (r.label as string).trim().length > 0
  );

  let routing: string;

  if (labeledRules.length > 0) {
    // Com rules: o LLM deve enviar reason com o nome da unidade
    const labels = labeledRules.map((r) => `"${r.label}"`).join(", ");
    const hasDefault = execCfg.assignee_id != null || execCfg.team_id != null;
    routing = [
      `NÃO envie assignee_id nem team_id diretamente — o backend roteia automaticamente via execution_config.`,
      `Use o parâmetro reason com o nome da unidade do cliente.`,
      `Opções disponíveis: ${labels}.`,
      hasDefault
        ? `Escalação geral (sem unidade específica): chame sem argumentos ou com reason="escalacao".`
        : `Sempre envie reason com o nome da unidade.`,
    ].join(" ");
  } else {
    // Sem rules: atribuição simples para o padrão configurado
    routing = `NÃO envie assignee_id nem team_id diretamente — chame sem argumentos. O backend atribui ao atendente/time correto automaticamente via execution_config.`;
  }

  return baseDescription ? `${baseDescription}\n\n${routing}` : routing;
}

function buildOpenAITools(
  tools: ToolDef[],
  baseUrl: string
): { openaiTools: Array<{ type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } }>; nameToTool: Map<string, ToolDef> } {
  const nameToTool = new Map<string, ToolDef>();
  const openaiTools = tools
    .filter((t) => t.function_def && typeof (t.function_def as Record<string, unknown>).name === "string")
    .map((t) => {
      const fd = t.function_def as Record<string, unknown>;
      const originalName = fd.name as string;
      const sanitizedName = sanitizeFunctionName(originalName, baseUrl);
      nameToTool.set(sanitizedName, t);
      return {
        type: "function" as const,
        function: {
          name: sanitizedName,
          description: enrichChatwootAssignDescription(t, (fd.description as string) || ""),
          parameters: normalizeParametersSchema(fd.parameters),
        },
      };
    });
  return { openaiTools, nameToTool };
}

export async function chatLocalRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/chat-local",
    async (
      req: FastifyRequest<{
        Body: {
          agent_id: string;
          messages: Array<{ role: string; content: string }>;
          conversation_id?: string | null;
          chatwoot_conversation_id?: number | null;
          attachments?: unknown[];
          external_user_id?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { agent_id, messages, conversation_id, chatwoot_conversation_id, external_user_id } = req.body;
      const body = req.body as Record<string, unknown>;
      const skipSave = (req.headers["x-skip-save"] as string) === "true" || body?.skip_save === true;

      if (!agent_id || !messages || !Array.isArray(messages)) {
        return reply.status(400).send({ error: "agent_id and messages required" });
      }

      const attachments = (body.attachments as Array<{ file_type?: string; data_url?: string }>) ?? [];
      let messagesToUse = [...messages];

      // Transcrição de áudio no sandbox (igual ao fluxo WhatsApp)
      const audioAttachments = attachments.filter(isAudioAttachment);
      if (audioAttachments.length > 0 && messagesToUse.length > 0) {
        const lastMsg = messagesToUse[messagesToUse.length - 1];
        if (lastMsg.role === "user") {
          console.log("[Chat-Local] Transcrevendo", audioAttachments.length, "áudio(s)...");
          const transcriptions = await Promise.all(
            audioAttachments.map((a) => transcribeAudio(a.data_url!))
          );
          const transcribedTexts = transcriptions.filter((t) => t.text).map((t) => t.text);
          if (transcribedTexts.length > 0) {
            const audioText = transcribedTexts.join("\n");
            console.log("[Chat-Local] Transcrição:", audioText.slice(0, 120));
            const prefix = lastMsg.content?.trim() ? `${lastMsg.content}\n` : "";
            messagesToUse = [
              ...messagesToUse.slice(0, -1),
              { ...lastMsg, content: `${prefix}[Áudio transcrito]: ${audioText}` },
            ];
          } else {
            const errors = transcriptions.filter((t) => t.error).map((t) => t.error);
            console.warn("[Chat-Local] Transcrição falhou:", errors);
            const fallback = "[O cliente enviou um áudio que não pôde ser transcrito. Peça para repetir por texto.]";
            messagesToUse = [
              ...messagesToUse.slice(0, -1),
              { ...lastMsg, content: lastMsg.content?.trim() ? `${lastMsg.content}\n${fallback}` : fallback },
            ];
          }
        }
      }

      // Extração de dados de documento (RG, CNH, comprovante) — sandbox e fluxo direto
      const docAttachments = attachments.filter(isImageOrPdfAttachment);
      if (docAttachments.length > 0 && messagesToUse.length > 0) {
        const lastMsg = messagesToUse[messagesToUse.length - 1];
        if (lastMsg.role === "user") {
          console.log("[Chat-Local] Extraindo dados de", docAttachments.length, "documento(s)...");
          const extractedParts: string[] = [];
          for (const doc of docAttachments) {
            const result = await extractDocument(doc.data_url!, doc);
            const formatted = formatExtractedForMessage(result.data);
            if (formatted) extractedParts.push(formatted);
          }
          if (extractedParts.length > 0) {
            const docText = extractedParts.join("\n");
            const prefix = lastMsg.content?.trim() ? `${lastMsg.content}\n` : "";
            messagesToUse = [
              ...messagesToUse.slice(0, -1),
              { ...lastMsg, content: `${prefix}${docText}` },
            ];
          }
        }
      }

      const supabase = createNexusClient();

      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, name, provider_id, model, system_prompt, temperature, tenant_id, config")
        .eq("id", agent_id)
        .single();

      if (agentErr || !agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug, settings")
        .eq("id", agent.tenant_id)
        .single();

      const tenantSlug = tenant?.slug ?? null;
      const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;
      const agentConfig = (agent.config || {}) as Record<string, unknown>;
      const rawDispatcherId = agentConfig.dispatcher_provider_id ?? tenantSettings.dispatcher_provider_id;
      const dispatcherProviderId = typeof rawDispatcherId === "string" && rawDispatcherId.length > 0 ? rawDispatcherId : null;

      const { data: toolsData } = await supabase.rpc("load_agent_tools", {
        p_agent_id: agent_id,
      });
      let tools = (toolsData || []) as ToolDef[];
      const hasInventoryTool = tools.some((t) => t.tool_type === "inventory_query");
      const hasCalendarTool = tools.some((t) => t.tool_type === "calendar_query");

      let calendarServices: { name: string; duration_minutes: number }[] = [];
      if (hasCalendarTool && agent.tenant_id) {
        const { data: servicesData } = await supabase
          .from("calendar_service_types")
          .select("name, duration_minutes")
          .eq("tenant_id", agent.tenant_id)
          .eq("active", true)
          .order("name");
        calendarServices = servicesData ?? [];
      }

      const leadLabelEnabled = !!agentConfig.lead_label_enabled;
      if (leadLabelEnabled) {
        tools = [
          ...tools,
          {
            id: "marcar-lead-injected",
            name: "Marcar Lead",
            tool_type: "marcar_lead",
            function_def: {
              name: "marcar_lead",
              description: "Marca o contato como novo lead aplicando a etiqueta do dia no Chatwoot (formato leadsDD-MM-AAAA, ex: leads19-03-2026). OBRIGATÓRIO chamar quando identificar que é um novo lead (potencial cliente interessado, ainda não é cliente).",
              parameters: { type: "object", properties: {}, required: [] },
            },
          } as ToolDef,
        ];
      }

      const isPetHome = tenantSlug === "pet-home" || tenantSlug === "pet-home-tia-erica";
      const isAutoescolaIdealEarly = tenantSlug === "ideal" || tenantSlug === "autoescola-ideal" || tenantSlug === "auto-escola-ideal";
      const promptCachingEnabledEarly = isAutoescolaIdealEarly || !!(tenantSettings.prompt_caching_enabled as boolean);
      const petContext = isPetHome ? buildPetGenderContext(messagesToUse) : null;
      let systemPrompt = buildSystemPrompt(
        agent.system_prompt || "",
        tenantSlug,
        hasInventoryTool,
        petContext,
        promptCachingEnabledEarly,
        hasCalendarTool,
        calendarServices,
      );
      if (leadLabelEnabled) {
        systemPrompt +=
          "\n\n[ETIQUETAGEM DE LEAD - OBRIGATÓRIO] Todo contato que for identificado como NOVO LEAD (potencial cliente interessado em produtos/serviços, ainda não é cliente) DEVE ser marcado chamando marcar_lead. A etiqueta será criada automaticamente no formato leadsDD-MM-AAAA (ex: leads19-03-2026). Chame marcar_lead assim que identificar interesse genuíno. NÃO chame para clientes existentes, retornos ou saudações sem interesse.";
      }

      // Injetar fotos já enviadas nesta conversa para evitar reenvio
      if (conversation_id) {
        try {
          const { data: histMsgs } = await supabase.rpc("load_conversation_messages", {
            p_agent_id: agent_id,
            p_conversation_id: conversation_id,
          }) as { data: Array<{ role: string; metadata?: { photos_sent?: Array<{ id: string; name: string }> } }> | null };
          if (histMsgs) {
            const sentPhotoNames: string[] = [];
            for (const msg of histMsgs) {
              if (msg.role === "assistant" && msg.metadata?.photos_sent?.length) {
                for (const p of msg.metadata.photos_sent) {
                  if (p.name && !sentPhotoNames.includes(p.name)) sentPhotoNames.push(p.name);
                }
              }
            }
            if (sentPhotoNames.length > 0) {
              systemPrompt += `\n\nFOTOS JÁ ENVIADAS NESTA CONVERSA: ${sentPhotoNames.join(", ")}`;
            }
          }
        } catch (histErr) {
          console.warn("[Chat-Local] Erro ao carregar histórico de fotos enviadas:", (histErr as Error)?.message);
        }
      }

      const providerConfig = await getProviderApiKey(agent.provider_id, supabase);
      if (!providerConfig) {
        msgLog.chatError(agent_id, "No LLM provider configured");
        return reply.status(501).send({
          error: "No LLM provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY, or configure provider with API key.",
        });
      }

      let model = agent.model || "gpt-4o-mini";
      const { openaiTools, nameToTool } = buildOpenAITools(tools, providerConfig.baseUrl);
      const useTools = openaiTools.length > 0;
      const isGeminiProvider = /generativelanguage|googleapis\.com\/v1beta/i.test(providerConfig.baseUrl);

      // Gemini 3 e 2.5 (thinking) exigem thought_signature em function calls - não suportado.
      // Fallback apenas em single-provider (quando Gemini recebe tools). Em dual-provider, Gemini conversacional não usa tools.
      if (useTools && !dispatcherProviderId && isGeminiProvider && /^gemini-(3|2\.5)-/i.test(model)) {
        model = "gemini-2.0-flash";
      }

      if (useTools && isGeminiProvider) {
        const invalidTools = openaiTools.filter((t) => {
          const name = t.function.name;
          return !/^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$/.test(name);
        });
        if (invalidTools.length > 0) {
          console.error("[Chat-Local] Tools com nomes inválidos para Gemini:", invalidTools);
          return reply.status(500).send({
            error: "Configuração inválida de tools para Gemini",
            details: invalidTools.map((t) => t.function.name),
          });
        }
      }

      let responseConvId = conversation_id ?? null;
      msgLog.chatStart(agent_id, model, useTools && dispatcherProviderId ? "dual" : "single");

      // Persistência: criar conversa e salvar mensagens (sandbox e chamadas diretas)
      try {
        if (!responseConvId) {
          const { data: newConvId, error: createErr } = await supabase.rpc("create_conversation", {
            p_agent_id: agent_id,
            p_channel: "sandbox",
            p_external_user_id: external_user_id ?? null,
            p_contact_name: null,
            p_contact_avatar_url: null,
          });
          if (createErr) {
            console.error("[Chat-Local] create_conversation failed:", createErr.message);
            if (/Tenant schema not provisioned|db_name/i.test(createErr.message)) {
              return reply.status(503).send({
                error: "Schema do tenant não provisionado. Crie o tenant pelo painel (Tenants) para provisionar automaticamente o schema de conversas.",
                code: "TENANT_NOT_PROVISIONED",
              });
            }
            throw createErr;
          }
          responseConvId = newConvId;
        }

        const lastUserMsg = messagesToUse.length > 0 ? messagesToUse[messagesToUse.length - 1] : null;
        if (!skipSave && responseConvId && lastUserMsg?.role === "user" && lastUserMsg.content?.trim()) {
          const userMsgMetadata = attachments.length > 0
            ? { attachments: attachments.map((a) => ({ file_type: a.file_type, data_url: a.data_url })) }
            : undefined;
          await supabase.rpc("save_message", {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
            p_role: "user",
            p_content: lastUserMsg.content.trim(),
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
            ...(userMsgMetadata && { p_metadata: userMsgMetadata }),
          });
        }
      } catch (persistErr) {
        console.error("[Chat-Local] Persistência inicial falhou:", (persistErr as Error)?.message);
        return reply.status(503).send({
          error: "Falha ao salvar conversa. Verifique se o tenant foi provisionado corretamente.",
          detail: (persistErr as Error)?.message,
        });
      }

      const sendSse = (data: unknown) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          /* stream closed */
        }
      };

      const origin = (req.headers.origin as string) || "";
      const extraOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        ...extraOrigins,
      ];
      const isAllowed = allowedOrigins.includes(origin) || /\.lovable\.dev$/.test(origin);
      const allowOrigin = isAllowed ? origin : "http://localhost:8080";

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Credentials": "true",
      });

      // Sandbox: enviar welcome_video no primeiro contato (paridade com Chat ao Vivo)
      const isFirstContact = messagesToUse.filter((m) => m.role === "assistant").length === 0;
      const welcomeVideoUrl = (agentConfig.welcome_video_url as string)?.trim();
      if (isFirstContact && welcomeVideoUrl) {
        sendSse({ metadata: { type: "welcome_video", video_url: welcomeVideoUrl } });
      }

      // Extract last messages for use in both dual and single-provider paths (echo guard, scheduling, etc)
      const lastAssistantMsg = [...messagesToUse].reverse().find((m) => m.role === "assistant");
      const lastUserMsg = [...messagesToUse].reverse().find((m) => m.role === "user");

      // Dual-provider: OpenAI para tools (dispatcher), Gemini para conversacional
      if (useTools && dispatcherProviderId) {
        const dispatcherConfig = await getProviderApiKey(dispatcherProviderId, supabase);
        if (dispatcherConfig) {
          const { openaiTools: dispatcherTools, nameToTool: dispatcherNameToTool } = buildOpenAITools(tools, dispatcherConfig.baseUrl);
          const dispatcherModel = (agentConfig.dispatcher_model as string)
            || (tenantSettings.dispatcher_model as string)
            || "gpt-4o-mini";

          const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          const tomorrowDate = new Date();
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          const tomorrowISO = tomorrowDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
          const dispatcherDateContext = `

[CONTEXTO TEMPORAL] Data de hoje (Brasília): ${todayISO}. Amanhã: ${tomorrowISO}.
Quando o cliente ESCOLHER um horário após você ter oferecido opções:
- Se você ofereceu horários para HOJE → use start_at="${todayISO}T[HORA]:00:00-03:00".
- Se você ofereceu horários para AMANHÃ (ex.: "amanhã de manhã", "amanhã às 11h") → use start_at="${tomorrowISO}T[HORA]:00:00-03:00", NÃO use a data de hoje.
Chame consultar_agenda com action="criar", title="Visita - [nome do cliente]", start_at no formato correto conforme o dia oferecido. NUNCA chame só check_availability quando o cliente já escolheu o horário.
REGRA ABSOLUTA: Se o cliente responde a uma oferta de horários com uma escolha (ex: "pode ser as 14:00", "10h", "amanhã as 10"), a action OBRIGATÓRIA é "criar". Chamar "cancelar" ou "check_availability" nesse cenário é um ERRO CRÍTICO.
Para REMARCAR: a conversa contém o horário já confirmado (ex.: "confirmado para dia 09/03 às 09:00"). Use esse horário em cancelar: start_at no formato YYYY-MM-DDTHH:mm:ss-03:00 (ano = ano de hoje). Em seguida use criar com o novo horário pedido pelo cliente, também com a data de hoje.`;
          let schedulingHint = "";
          if (lastAssistantMsg && lastUserMsg) {
            const offeredTimes = /\b\d{1,2}[h:]\d{0,2}\b/.test(lastAssistantMsg.content);
            const offeredTomorrow = /amanh[aã]|dia seguinte|depois de amanhã/i.test(lastAssistantMsg.content);
            const userChoseTime = /\b\d{1,2}[h:]\d{0,2}\b/.test(lastUserMsg.content) ||
              /(pode ser|quero|prefiro|vou|marco|as\s+\d|amanh[aã]\s*(as)?\s*\d)/i.test(lastUserMsg.content);
            // Detecta se o último turno indicou falha de agendamento (horário não disponível)
            const lastAssistantHadBookingFailure = /não est[aá] (mais )?disponível|horário indisponível|tive um (pequeno )?problema|imprevisto|não consigo confirmar|vou verificar os horários/i.test(lastAssistantMsg.content);
            if (offeredTimes && userChoseTime && !lastAssistantHadBookingFailure) {
              schedulingHint = `\n\n[HINT OBRIGATÓRIO] O assistente ofereceu horários e o cliente ESCOLHEU um. Você DEVE chamar consultar_agenda com action="criar". NÃO use "cancelar" nem "check_availability".`;
              if (offeredTomorrow) {
                schedulingHint += ` Use a data de AMANHÃ em start_at: ${tomorrowISO}T[HORA]:00:00-03:00 (ex.: ${tomorrowISO}T11:00:00-03:00), NÃO use ${todayISO}.`;
              }
            } else if (lastAssistantHadBookingFailure) {
              schedulingHint = `\n\n[HINT OBRIGATÓRIO] O agendamento anterior falhou. NÃO chame "criar" diretamente. PRIMEIRO chame consultar_agenda com action="check_availability" para verificar os horários realmente disponíveis antes de oferecer novas opções ao cliente.`;
            }
          }

          // Entity extraction: detect marca/modelo/ano/km from last user message to help the dispatcher
          const entities = lastUserMsg ? extractVehicleEntities(lastUserMsg.content) : {};
          const appraisalCtx = isAppraisalContext(messagesToUse);
          let entityHint = "";
          if (entities.marca || entities.modelo || entities.ano || entities.km) {
            const parts: string[] = [];
            if (entities.marca) parts.push(`Marca: ${entities.marca}`);
            if (entities.modelo) parts.push(`Modelo: ${entities.modelo}`);
            if (entities.ano) parts.push(`Ano: ${entities.ano}`);
            if (entities.km) parts.push(`KM: ${entities.km}`);
            entityHint = `\n\n[ENTIDADES DETECTADAS na última mensagem do cliente]\n${parts.join("\n")}\nUse EXATAMENTE estas entidades ao montar os argumentos das tools. NÃO invente valores diferentes.`;
          }
          if (appraisalCtx) {
            entityHint += `\n\n[CONTEXTO DE FLUXO] A última mensagem do assistente pedia dados do veículo do CLIENTE (marca, modelo, ano, km). Isso é APPRAISAL (intent A). NÃO chame consultar_fipe — avaliação é feita presencialmente pelo time comercial. Se o cliente já forneceu marca+modelo+ano, chame consultar_agenda com action "check_availability" e date "${todayISO}" para oferecer horários reais ao sugerir visita na loja. NÃO chame consultar_estoque.`;
          }

          const hasNearestUnitTool = tools.some((t) => t.tool_type === "nearest_unit" || t.tool_type === "consultar_unidade");
          let cepHint = "";
          if (hasNearestUnitTool) {
            // Buscar CEP em toda a conversa (cliente pode ter informado em mensagem anterior)
            const fullConvText = messagesToUse.map((m) => (m.content ?? "")).join(" ");
            const cep = extractCepFromText(fullConvText);
            if (cep) {
              cepHint = `\n\n[CEP DETECTADO na conversa: ${cep}. OBRIGATÓRIO: chame consultar_unidade/nearest_unit com cep="${cep}" e tenant_id quando aplicável. Sem cep a ferramenta retorna erro. NÃO retorne NO_TOOLS_NEEDED.]`;
            }
          }

          const hasAssignTool = tools.some((t) => t.tool_type === "chatwoot_assign");
          const isAutoescolaIdeal = tenantSlug === "ideal" || tenantSlug === "autoescola-ideal" || tenantSlug === "auto-escola-ideal";
          const promptCachingEnabled = isAutoescolaIdeal || !!(tenantSettings.prompt_caching_enabled as boolean);
          const assignHint = buildAutoescolaIdealAssignHint(messagesToUse, hasAssignTool, tenantSlug);
          const leadHint = buildLeadHint(messagesToUse, leadLabelEnabled);

          const staticDispatcherPrompt = getDispatcherPrompt(tenantSlug, hasCalendarTool) + dispatcherDateContext;
          const hintsBlock = [entityHint, cepHint, assignHint, leadHint, schedulingHint].filter(Boolean).join("");
          const messagesForDispatcher = promptCachingEnabled && hintsBlock && messagesToUse.length > 0
            ? (() => {
                const last = messagesToUse[messagesToUse.length - 1];
                const rest = messagesToUse.slice(0, -1);
                const lastWithHints = last?.role === "user"
                  ? { ...last, content: `${last.content || ""}\n\n[CONTEXTO ADICIONAL]\n${hintsBlock.trim()}` }
                  : last;
                return lastWithHints ? [...rest, lastWithHints] : messagesToUse;
              })()
            : messagesToUse;
          const dispatcherSystemPrompt = promptCachingEnabled ? staticDispatcherPrompt : staticDispatcherPrompt + hintsBlock;
          const dispatcherMessages = toOpenAIMessages(
            dispatcherSystemPrompt,
            promptCachingEnabled ? messagesForDispatcher : messagesToUse
          );

          const base = dispatcherConfig.baseUrl.replace(/\/+$/, "");
          const isGeminiBase = /generativelanguage\.googleapis\.com/i.test(base);
          const dispatcherApiUrl = isGeminiBase && !base.includes("/openai")
            ? `${base}/openai/chat/completions`
            : `${base}/chat/completions`;

          const DEPRECATED_GEMINI_FALLBACK: Record<string, string> = {
            "gemini-2.0-flash-lite": "gemini-2.0-flash",
            "models/gemini-2.0-flash-lite": "gemini-2.0-flash",
          };

          let dispatcherModelToUse = dispatcherModel;
          let dispatcherResp!: Response;
          for (let attempt = 0; attempt < 2; attempt++) {
            const dispatcherBody: Record<string, unknown> = {
              model: dispatcherModelToUse,
              messages: dispatcherMessages,
              stream: true,
              stream_options: { include_usage: true },
              temperature: 0.2,
              tools: dispatcherTools,
              tool_choice: "auto",
              ...(promptCachingEnabled && !isGeminiBase && { prompt_cache_key: `agent:${agent_id}:tenant:${tenantSlug || "default"}:date:${todayISO}` }),
            };

            try {
              dispatcherResp = await fetch(dispatcherApiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${dispatcherConfig.apiKey}`,
                },
                body: JSON.stringify(dispatcherBody),
                signal: AbortSignal.timeout(60000),
              });
            } catch (fetchErr: unknown) {
              const e = fetchErr as { code?: string; message?: string };
              const isNetworkError = e?.code === "ECONNRESET" || /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(String(e?.message || ""));
              console.error("[Chat-Local] Dispatcher fetch failed:", e?.message || fetchErr);
              sendSse({ error: isNetworkError ? "Conexão com LLM interrompida. Tente novamente." : (e?.message || "Falha ao conectar com dispatcher") });
              sendSse("[DONE]");
              reply.raw.end();
              return;
            }

            if (dispatcherResp.ok) break;

            const errText = await dispatcherResp.text();
            console.error("[Chat-Local] Dispatcher error:", dispatcherResp.status, errText.slice(0, 200));

            const is404Deprecated = dispatcherResp.status === 404 && /no longer available|deprecated/i.test(errText);
            const fallbackModel = DEPRECATED_GEMINI_FALLBACK[dispatcherModelToUse] || DEPRECATED_GEMINI_FALLBACK[`models/${dispatcherModelToUse}`];
            if (attempt === 0 && is404Deprecated && isGeminiBase && fallbackModel) {
              console.log(`[Chat-Local] Modelo ${dispatcherModelToUse} deprecado, tentando fallback: ${fallbackModel}`);
              dispatcherModelToUse = fallbackModel;
              continue;
            }

            sendSse({ error: providerErrorMessage(dispatcherResp.status, errText) });
            sendSse("[DONE]");
            reply.raw.end();
            return;
          }

          const reader = dispatcherResp.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let dispatcherContent = "";
          const toolCallsAccum: Record<number, { id: string; name: string; args: string }> = {};
          let dispatcherUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

          while (true) {
            const { done, value } = await reader.read();
            buf += decoder.decode(value || new Uint8Array(), { stream: !done });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6);
                if (!jsonStr || jsonStr === "[DONE]") continue;
                try {
                  const ev = JSON.parse(jsonStr);
                  if (ev.usage) {
                    dispatcherUsage = {
                      prompt_tokens: ev.usage.prompt_tokens ?? 0,
                      completion_tokens: ev.usage.completion_tokens ?? 0,
                      total_tokens: ev.usage.total_tokens ?? 0,
                    };
                  }
                  const delta = ev.choices?.[0]?.delta;
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCallsAccum[idx]) {
                        toolCallsAccum[idx] = {
                          id: tc.id || `call_${idx}`,
                          name: tc.function?.name || "",
                          args: tc.function?.arguments || "",
                        };
                      } else {
                        if (tc.id) toolCallsAccum[idx].id = tc.id;
                        if (tc.function?.name) toolCallsAccum[idx].name = tc.function.name;
                        if (tc.function?.arguments) toolCallsAccum[idx].args += tc.function.arguments;
                      }
                    }
                  }
                  if (delta?.content) dispatcherContent += delta.content;
                } catch { /* skip */ }
              }
            }
            if (done) break;
          }

          const phase1ToolCalls = Object.values(toolCallsAccum)
            .filter((tc) => tc.name)
            .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }));

          const dualDebugAccum: unknown[] = [];

          if (phase1ToolCalls.length > 0) {
            console.log("[Chat-Local] Dispatcher decidiu chamar tools:", phase1ToolCalls.map((tc) => ({
              tool: tc.function.name,
              args: tc.function.arguments,
            })));
          }

          let conversationalMessages: typeof dispatcherMessages;
          let handoffAssigneeId: number | null = null;
          let handoffTeamId: number | null = null;

          if (phase1ToolCalls.length > 0) {
            const assistantMsg: { role: "assistant"; content: string; tool_calls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } = {
              role: "assistant",
              content: dispatcherContent || "",
              tool_calls: phase1ToolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            };
            conversationalMessages = toOpenAIMessages(systemPrompt, messagesToUse);
            conversationalMessages.push(assistantMsg);

            const debugEntries: Array<{ type: string; tool?: string; args?: Record<string, unknown>; tool_type?: string; preview?: unknown; [k: string]: unknown }> = [
              { type: "dispatcher_tool_calls", tool_names: phase1ToolCalls.map((tc) => tc.function.name), tool_calls_count: phase1ToolCalls.length },
            ];

            const agendaCriarCache = new Map<string, { result: unknown; success: boolean }>();
            let sendNotificationExecutedThisTurn = false;

            // consultar_fipe removido do fluxo (v3.5.0) — avaliações são presenciais

            for (const tc of phase1ToolCalls) {
              const tool = dispatcherNameToTool.get(tc.function.name);
              if (!tool) {
                console.warn("[Chat-Local] Tool não encontrada:", tc.function.name);
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || "{}");
                } catch {
                  args = {};
                }
                debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                debugEntries.push({ type: "tool_result", preview: { error: "Tool not found" } });
                conversationalMessages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify({ error: "Tool not found" }),
                });
              } else {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(tc.function.arguments || "{}");
                } catch {
                  args = {};
                }

                // ── consultar_fipe removido (v3.5.0) — avaliações são presenciais ──
                // Se o dispatcher ainda chamar consultar_fipe por engano, rejeitar com mensagem clara
                const isFipeTool = /consultar_fipe|fipe/i.test(tc.function.name);
                if (isFipeTool) {
                  console.warn("[Chat-Local] consultar_fipe REJEITADO: ferramenta removida do fluxo (v3.5.0). args:", JSON.stringify(args));
                  debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                  debugEntries.push({ type: "tool_result", preview: { error: "consultar_fipe removido — avaliação é presencial" } });
                  conversationalMessages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ error: "consultar_fipe não é mais utilizado. A avaliação do veículo do cliente é feita presencialmente pelo time comercial. Colete os dados do veículo (marca, modelo, ano, km, placa) e conduza para agendamento de visita." }),
                  });
                  continue;
                }

                const isEstoqueEmpty = tc.function.name === "consultar_estoque" && Object.keys(args).length === 0;
                if (isEstoqueEmpty) {
                  const recentText = messagesToUse
                    .slice(-8)
                    .map((m) => (m.content ?? ""))
                    .join("\n");
                  const fallbackEntities = extractVehicleEntities(recentText);
                  if (fallbackEntities.marca || fallbackEntities.modelo) {
                    args = { ...args };
                    if (fallbackEntities.marca) args.marca = fallbackEntities.marca;
                    if (fallbackEntities.modelo) args.modelo = fallbackEntities.modelo;
                    if (fallbackEntities.ano) args.ano = fallbackEntities.ano;
                    console.log("[Chat-Local] consultar_estoque args vazios: fallback extraiu do histórico:", JSON.stringify(args));
                  } else {
                    console.warn("[Chat-Local] consultar_estoque BLOQUEADO: args vazios e nenhum veículo no histórico.");
                    debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                    debugEntries.push({ type: "tool_result", preview: { error: "consultar_estoque rejeitado — args vazios" } });
                    conversationalMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ error: "consultar_estoque chamado com args vazios {}. Você DEVE especificar pelo menos marca ou modelo. Analise o histórico da conversa para identificar o veículo discutido." }),
                    });
                    continue;
                  }
                }

                const agendaAction = String(args.action ?? "check_availability");
                const isAgendaCriar = tc.function.name === "consultar_agenda" && (agendaAction === "criar" || agendaAction === "create");
                if (isAgendaCriar) {
                  const startAt = String(args.start_at ?? args.start ?? args.date_time ?? "").trim();
                  const title = String(args.title ?? args.titulo ?? "").trim();
                  const dedupeKey = `${startAt}|${title}`;
                  const cached = agendaCriarCache.get(dedupeKey);
                  if (cached) {
                    console.log("[Chat-Local] consultar_agenda(criar) duplicada ignorada:", dedupeKey);
                    debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                    debugEntries.push({ type: "tool_result", preview: cached.success ? cached.result : { error: cached.result } });
                    conversationalMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify(cached.success ? cached.result : { error: cached.result }),
                    });
                    continue;
                  }
                }

                if (tool.tool_type === "chatwoot_assign" || tool.tool_type === "marcar_lead") {
                  if (responseConvId) args = { ...args, conversation_id: responseConvId };
                  if (chatwoot_conversation_id != null) args = { ...args, chatwoot_conversation_id };
                }
                if (tool.tool_type === "chatwoot_assign") {
                  // Quando o LLM não envia assignee_id/team_id, usar os padrões da config (team_id é essencial quando não há assignee)
                  const cfg = (tool.execution_config || {}) as Record<string, unknown>;
                  if (args.assignee_id == null && cfg.assignee_id != null) args = { ...args, assignee_id: cfg.assignee_id };
                  if (args.team_id == null && cfg.team_id != null) args = { ...args, team_id: cfg.team_id };
                  // Injetar reason das últimas mensagens do cliente para casar regras por unidade (ex: "unidade aparecidinha")
                  const reason = String(args?.reason || "").trim();
                  if ((!reason || reason === "escalation") && messagesToUse.length > 0) {
                    let userMsgs = messagesToUse
                      .filter((m) => (m as { role?: string }).role === "user")
                      .map((m) => (m as { content?: string }).content ?? "")
                      .filter((content) => !content.includes("[SISTEMA INTERNO"))
                      .slice(-3)
                      .join(" ")
                      .trim();
                    if (isAutoescolaIdeal && userMsgs) {
                      for (const [alias, canonical] of Object.entries(IDEAL_UNITS_MAP)) {
                        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        userMsgs = userMsgs.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
                      }
                    }
                    if (userMsgs) args = { ...args, reason: userMsgs };
                  }
                }
                if (tool.tool_type === "nearest_unit" || tool.tool_type === "consultar_unidade") {
                  if (!args.cep || String(args.cep).trim() === "") {
                    // Buscar CEP em até 30 mensagens (cliente pode ter informado há várias trocas)
                    const recentText = messagesToUse
                      .slice(-30)
                      .map((m) => (m.content ?? ""))
                      .join(" ");
                    const cepFallback = extractCepFromText(recentText);
                    if (cepFallback) {
                      args = { ...args, cep: cepFallback };
                      console.log("[Chat-Local] consulta CEP/unidade sem cep: injetado do histórico:", cepFallback);
                    }
                  }
                  if (!args.tenant_id && agent?.tenant_id) {
                    args = { ...args, tenant_id: agent.tenant_id };
                  }
                }
                if (isEnviarNotificacaoTool(tool)) {
                  args = enrichEnviarNotificacaoArgs(messagesToUse, external_user_id, args);
                }
                console.log("[Chat-Local] Executando tool:", tc.function.name, "| args:", JSON.stringify(args));
                debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                const result = await executeTool(tool, args, agent_id);
                const resultPreview = result.success
                  ? (typeof result.result === "object" ? JSON.stringify(result.result).slice(0, 200) : String(result.result).slice(0, 200))
                  : result.error;
                console.log("[Chat-Local] Resultado tool", tc.function.name, "| success:", result.success, "| preview:", resultPreview);
                const previewForDebug =
                  result.success && typeof result.result === "object"
                    ? result.result
                    : result.success
                      ? { value: String(result.result).slice(0, 500) }
                      : { error: result.error };
                debugEntries.push({ type: "tool_result", preview: previewForDebug });
                conversationalMessages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: JSON.stringify(result.success ? result.result : { error: result.error }),
                });
                if (tc.function.name === "consultar_agenda") {
                  const agendaActionDone = String(args.action ?? "check_availability");
                  if (agendaActionDone === "criar" || agendaActionDone === "create") {
                    const startAt = String(args.start_at ?? args.start ?? args.date_time ?? "").trim();
                    const title = String(args.title ?? args.titulo ?? "").trim();
                    agendaCriarCache.set(`${startAt}|${title}`, {
                      result: result.success ? result.result : result.error,
                      success: result.success,
                    });
                  }
                  if (result.success && result.result) {
                    sendAgendaNotification(agent_id, agent, result.result, messagesToUse, external_user_id, responseConvId, chatwoot_conversation_id).catch(() => {});
                  }
                }
                if (tool.tool_type === "send_notification" && result.success) {
                  sendNotificationExecutedThisTurn = true;
                }
                if (tool.tool_type === "chatwoot_assign" && result.success && responseConvId) {
                  const res = result.result as { assignee_id?: number | null; team_id?: number | null };
                  if (res.assignee_id != null) handoffAssigneeId = res.assignee_id;
                  if (res.team_id != null) handoffTeamId = res.team_id;
                  if (!sendNotificationExecutedThisTurn) {
                    sendHandoffNotification(agent_id, agent, messagesToUse, external_user_id).then(() => {}, () => {});
                  }
                  supabase.rpc("cancel_pending_followups", {
                    p_agent_id: agent_id,
                    p_conversation_id: responseConvId,
                    p_cancel_reason: "human_assigned",
                  }).then(() => {}, () => {});
                }
              }
            }
            dualDebugAccum.push(...debugEntries);
            sendSse({ debug: debugEntries });
          } else {
            conversationalMessages = toOpenAIMessages(systemPrompt, messagesToUse);
          }

          // Limpar mensagens para Gemini conversacional: remover tool_calls e mensagens "tool"
          // Gemini 3/2.5 exige thought_signature quando vê tool_calls; sem tool_calls não exige
          const toolResults: string[] = [];
          const conversationalMessagesClean = conversationalMessages
            .map((msg) => {
              if ((msg as { role?: string }).role === "tool" && "content" in msg) {
                toolResults.push((msg as { content: string }).content);
                return null;
              }
              if ((msg as { role?: string; tool_calls?: unknown }).role === "assistant" && "tool_calls" in msg) {
                return { role: "assistant" as const, content: (msg as { content?: string }).content || "" };
              }
              return msg;
            })
            .filter((m): m is NonNullable<typeof m> => m !== null) as Array<{ role: "system" | "user" | "assistant"; content: string }>;

          let naturalToolResultsText = "";
          if (toolResults.length > 0) {
            naturalToolResultsText = toolResults.map((r) => {
              try {
                const obj = JSON.parse(r) as Record<string, unknown>;
                return summarizeToolResult(obj);
              } catch {
                return r;
              }
            }).join("\n\n");

            conversationalMessagesClean.push({
              role: "user",
              content: `Resultados obtidos:\n${naturalToolResultsText}\n\nCom base nesses resultados, responda ao cliente de forma natural e objetiva. NÃO inclua JSON ou artefatos técnicos internos.`,
            });
          }
          // #region agent log
          fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:929',message:'Mensagens para conversacional (Gemini)',data:{messagesCount:conversationalMessagesClean.length,toolResultsCount:toolResults.length,naturalToolResultsTextPreview:naturalToolResultsText.slice(0,300),lastMessage:conversationalMessagesClean[conversationalMessagesClean.length-1]},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion

          const convModel = model;
          const convBase = providerConfig.baseUrl.replace(/\/+$/, "");
          const convIsGemini = /generativelanguage\.googleapis\.com/i.test(convBase);
          const convApiUrl = convIsGemini && !convBase.includes("/openai")
            ? `${convBase}/openai/chat/completions`
            : `${convBase}/chat/completions`;

          const convBody: Record<string, unknown> = {
            model: convModel,
            messages: conversationalMessagesClean,
            stream: true,
            stream_options: { include_usage: true },
            temperature: agent.temperature ?? 0.7,
          };

          // Gemini 2.5+: thinking já ativo por padrão no modelo.
          // Google recomenda temperature=1.0 para modelos 2.5 com thinking.
          if (convIsGemini && isGeminiThinkingModel(convModel)) {
            convBody.temperature = 1.0;
          }

          let convResp: Response;
          try {
            convResp = await fetch(convApiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${providerConfig.apiKey}`,
              },
              body: JSON.stringify(convBody),
              signal: AbortSignal.timeout(60000),
            });
          } catch (fetchErr: unknown) {
            const e = fetchErr as { code?: string; message?: string };
            const isNetworkError = e?.code === "ECONNRESET" || /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(String(e?.message || ""));
            console.error("[Chat-Local] Conversational fetch failed:", e?.message || fetchErr);
            sendSse({ error: isNetworkError ? "Conexão com LLM interrompida. Tente novamente." : (e?.message || "Falha ao conectar com LLM conversacional") });
            sendSse("[DONE]");
            reply.raw.end();
            return;
          }

          if (!convResp.ok) {
            const errText = await convResp.text();
            console.error("[Chat-Local] Conversational LLM error:", convResp.status, errText.slice(0, 200));
            sendSse({ error: providerErrorMessage(convResp.status, errText) });
            sendSse("[DONE]");
            reply.raw.end();
            return;
          }

          let debugDeltaCount = 0;
          let debugDeltaTotalLen = 0;
          let debugSendCount = 0;
          let debugSendTotalLen = 0;
          let dualContentToSave = "";

          const convReader = convResp.body!.getReader();
          const convDecoder = new TextDecoder();
          let convBuf = "";
          let streamFilterBuffer = "";
          let convFullContent = "";
          let conversationalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

          while (true) {
            const { done, value } = await convReader.read();
            convBuf += convDecoder.decode(value || new Uint8Array(), { stream: !done });
            let nl: number;
            while ((nl = convBuf.indexOf("\n")) !== -1) {
              const line = convBuf.slice(0, nl).trim();
              convBuf = convBuf.slice(nl + 1);
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6);
                if (!jsonStr || jsonStr === "[DONE]") continue;
                try {
                  const ev = JSON.parse(jsonStr);
                  if (ev.usage) {
                    conversationalUsage = {
                      prompt_tokens: ev.usage.prompt_tokens ?? 0,
                      completion_tokens: ev.usage.completion_tokens ?? 0,
                      total_tokens: ev.usage.total_tokens ?? 0,
                    };
                  }
                  const delta = ev.choices?.[0]?.delta;
                  if (delta?.content) {
                    convFullContent += delta.content;
                    debugDeltaCount++;
                    debugDeltaTotalLen += (delta.content || "").length;
                    // #region agent log
                    fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1017',message:'Delta recebido do Gemini',data:{deltaContent:delta.content,deltaLen:delta.content.length,streamFilterBufferBefore:streamFilterBuffer},timestamp:Date.now(),hypothesisId:'H1,H4'})}).catch(()=>{});
                    // #endregion
                    const { toSend, newBuffer } = filterCommandLinesFromStream(streamFilterBuffer, delta.content);
                    streamFilterBuffer = newBuffer;
                    // #region agent log
                    fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1020',message:'Após filterCommandLines',data:{toSend:toSend,toSendLen:toSend.length,newBuffer:newBuffer,wasFiltered:delta.content.length>0&&toSend.length===0},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
                    // #endregion
                    if (toSend) {
                      const accented = restorePortugueseAccents(toSend);
                      debugSendCount++;
                      debugSendTotalLen += accented.length;
                      sendSse({ choices: [{ delta: { content: accented } }] });
                    }
                  }
                } catch { /* skip */ }
              }
            }
            if (done) {
              convFullContent += streamFilterBuffer;
              if (streamFilterBuffer) {
                const accented = restorePortugueseAccents(streamFilterBuffer);
                debugSendCount++;
                debugSendTotalLen += accented.length;
                sendSse({ choices: [{ delta: { content: accented } }] });
              }
              // Primeiro contato: pergunta do nome. Em produção (com Chatwoot) o delivery envia; no sandbox precisamos enviar aqui.
              const isFirstContact = messagesToUse.filter((m) => m.role === "assistant").length === 0;
              const agentCfg = (agent?.config || {}) as Record<string, unknown>;
              const hasWelcomeVideo = !!(agentCfg.welcome_video_url as string)?.trim();
              const nameQuestion = (agentCfg.welcome_name_question as string) || "Como posso te chamar?";
              const alreadyHasNameQuestion =
                convFullContent.toLowerCase().includes(nameQuestion.toLowerCase()) ||
                convFullContent.toLowerCase().includes("com quem eu falo?");
              const clientAlreadyGaveName = userHasProvidedNameInMessages(messagesToUse);
              const isSandbox = !chatwoot_conversation_id;
              const shouldAddNameQuestion = isFirstContact && nameQuestion && !alreadyHasNameQuestion && !clientAlreadyGaveName;
              if (shouldAddNameQuestion && (isSandbox || !hasWelcomeVideo)) {
                const nqContent = "\n\n" + nameQuestion;
                convFullContent += nqContent;
                debugSendCount++;
                debugSendTotalLen += nqContent.length;
                sendSse({ choices: [{ delta: { content: nqContent } }] });
              }
              break;
            }
          }

          // Extrair IDs de fotos/vídeos dos comandos no conteúdo bruto (antes do sanitize/filter)
          const dualPhotosSent: Array<{ id: string; name: string }> = [];
          {
            const photoIdRegex = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)\s*\|\s*id:\s*([a-f0-9-]{36})/gi;
            const videoIdRegex = /ENVIAR_VIDEO_DETALHES[:\s]+[^|\n]+\|\s*id:\s*([a-f0-9-]{36})/gi;
            const photoInventoryIds: string[] = [];
            const videoInventoryIds: string[] = [];
            let cmdMatch: RegExpExecArray | null;
            while ((cmdMatch = photoIdRegex.exec(convFullContent)) !== null) {
              const [, photoName, photoId] = cmdMatch;
              if (photoId && !photoInventoryIds.includes(photoId)) {
                photoInventoryIds.push(photoId);
                dualPhotosSent.push({ id: photoId, name: (photoName ?? "").trim() });
              }
            }
            while ((cmdMatch = videoIdRegex.exec(convFullContent)) !== null) {
              if (cmdMatch[1] && !videoInventoryIds.includes(cmdMatch[1])) videoInventoryIds.push(cmdMatch[1]);
            }

            if (photoInventoryIds.length > 0 || videoInventoryIds.length > 0) {
              sendSse({ media_commands: { photo_inventory_ids: photoInventoryIds, video_inventory_ids: videoInventoryIds } });
            }
          }

          if (/HANDOFF_COMERCIAL/i.test(convFullContent)) {
            sendHandoffNotification(agent_id, agent, messagesToUse, external_user_id).catch((e) => {
              console.warn("[Chat-Local] Erro ao enviar notificação de handoff:", (e as Error)?.message);
            });
            if (responseConvId) {
              supabase.rpc("cancel_pending_followups", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
                p_cancel_reason: "user_replied",
              }).then(
                ({ data: cancelled }) => {
                  if (cancelled != null && (cancelled as number) > 0) {
                    console.log("[Chat-Local] Follow-up(s) cancelado(s) no handoff:", cancelled);
                  }
                },
                (e: unknown) => {
                  console.warn("[Chat-Local] Erro ao cancelar follow-up no handoff:", (e as Error)?.message);
                }
              );
            }
          }

          if (debugSendTotalLen === 0) {
            const msgCountInput = messagesToUse.length;
            const convMsgCount = conversationalMessagesClean.filter((m) => m.role === "user" || m.role === "assistant").length;
            console.warn("[Chat-Local] Resposta vazia do conversacional", {
              debugDeltaCount,
              debugDeltaTotalLen,
              debugSendCount,
              messagesToUseCount: msgCountInput,
              conversationalUserAssistantCount: convMsgCount,
              responseConvId,
              streamFilterBufferPreview: streamFilterBuffer.slice(0, 120),
              convFullContentPreview: convFullContent.slice(0, 120),
              hint: debugDeltaTotalLen > 0 && debugSendTotalLen === 0 ? "conteúdo filtrado por filterCommandLines" : "modelo retornou vazio ou sem deltas",
            });
            try {
              const retryMessages = conversationalMessagesClean.slice(0, 1).concat(
                conversationalMessagesClean.filter((m) => m.role === "user" || m.role === "assistant").slice(-RETRY_CONTEXT_MESSAGE_LIMIT)
              );
              console.warn("[Chat-Local] Retry usando contexto reduzido", {
                retryMessagesCount: retryMessages.length,
                originalConversationalCount: conversationalMessagesClean.length,
                responseConvId,
              });
              if (toolResults.length > 0 && naturalToolResultsText) {
                retryMessages.push({ role: "user", content: `Resultados obtidos:\n${naturalToolResultsText}\n\nCom base nesses resultados, responda ao cliente de forma natural e objetiva. NÃO inclua JSON ou artefatos técnicos internos. EXCEÇÃO OBRIGATÓRIA: se o contexto indicar fotos ou vídeo disponíveis e o cliente tiver pedido, inclua na PRIMEIRA linha da resposta o comando de sistema correspondente (ex: ENVIAR_FOTOS_VEICULO: nome | id: uuid ou ENVIAR_VIDEO_DETALHES: nome | id: uuid), conforme instruído no seu prompt de sistema.` });
              }
              const retryBody = { model: convModel, messages: retryMessages, stream: false, temperature: agent.temperature ?? 0.7 };
              const retryResp = await fetch(convApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${providerConfig.apiKey}` },
                body: JSON.stringify(retryBody),
                signal: AbortSignal.timeout(30000),
              });
              if (retryResp.ok) {
                const retryJson = await retryResp.json() as { choices?: Array<{ message?: { content?: string } }> };
                const retryContent = retryJson.choices?.[0]?.message?.content?.trim();
                if (retryContent) {
                  const lastUserContent = lastUserMsg?.role === "user" ? (lastUserMsg.content?.trim() ?? "") : "";
                  if (isEchoResponse(retryContent, lastUserContent) || isRepeatedEmojiResponse(retryContent)) {
                    // Echo detectado no retry: o LLM respondeu com a mesma mensagem do cliente, ou muitos emojis repetidos
                    console.warn("[Chat-Local] Echo ou emojis repetidos detectados no retry:", retryContent.slice(0, 50), "- usando fallback");
                    const fallback = "Pode me dar mais detalhes sobre o que você precisa?";
                    dualContentToSave = fallback;
                    sendSse({ choices: [{ delta: { content: fallback } }] });
                  } else {
                    const sanitized = sanitizeLLMOutput(retryContent);
                    if (sanitized) {
                      dualContentToSave = sanitized;
                      console.log("[Chat-Local] Retry OK, enviando conteúdo sanitizado:", sanitized.slice(0, 80));
                      sendSse({ choices: [{ delta: { content: sanitized } }] });
                    } else {
                    const fallback = fallbackSanitizeForRetry(retryContent);
                    dualContentToSave = fallback || "Opa, tive um problema na última mensagem enviada, pode me reenviar?";
                    if (fallback) {
                      console.log("[Chat-Local] sanitize retornou vazio, usando fallback:", fallback.slice(0, 80));
                      sendSse({ choices: [{ delta: { content: fallback } }] });
                    } else {
                      console.warn("[Chat-Local] sanitize retornou vazio, retryContent preview:", retryContent.slice(0, 200));
                      sendSse({ choices: [{ delta: { content: "Opa, tive um problema na última mensagem enviada, pode me reenviar?" } }] });
                    }
                    }
                  }
                } else {
                  dualContentToSave = "Opa, tive um problema na última mensagem enviada, pode me reenviar?";
                  console.warn("[Chat-Local] Retry também retornou vazio, enviando mensagem neutra");
                  sendSse({ choices: [{ delta: { content: "Opa, tive um problema na última mensagem enviada, pode me reenviar?" } }] });
                }
              } else {
                dualContentToSave = "Opa, tive um problema na última mensagem enviada, pode me reenviar?";
                const errText = await retryResp.text();
                console.warn("[Chat-Local] Retry falhou:", retryResp.status, errText.slice(0, 150));
                sendSse({ choices: [{ delta: { content: "Opa, tive um problema na última mensagem enviada, pode me reenviar?" } }] });
              }
            } catch (retryErr) {
              dualContentToSave = "Opa, tive um problema na última mensagem enviada, pode me reenviar?";
              console.error("[Chat-Local] Retry error:", retryErr);
              sendSse({ choices: [{ delta: { content: "Opa, tive um problema na última mensagem enviada, pode me reenviar?" } }] });
            }
          } else {
            const fullResponse = sanitizeLLMOutput((convFullContent + streamFilterBuffer).trim());
            // Verificar se a resposta tem emojis repetidos excessivamente
            if (isRepeatedEmojiResponse(fullResponse)) {
              console.warn("[Chat-Local] Resposta principal rejeitada por emojis repetidos");
              dualContentToSave = "Pode me dar mais detalhes sobre o que você precisa?";
            } else {
              dualContentToSave = fullResponse;
            }
          }

          const tokenUsagePayload = {
            dispatcher: dispatcherUsage ? { ...dispatcherUsage, model: dispatcherModel } : null,
            conversational: conversationalUsage ? { ...conversationalUsage, model: convModel } : null,
          };
          if (dispatcherUsage || conversationalUsage) {
            sendSse({ token_usage: tokenUsagePayload });
            const totalPrompt = (dispatcherUsage?.prompt_tokens ?? 0) + (conversationalUsage?.prompt_tokens ?? 0);
            const totalCompletion = (dispatcherUsage?.completion_tokens ?? 0) + (conversationalUsage?.completion_tokens ?? 0);
            try {
              await supabase.from("agent_token_usage").insert({
                agent_id,
                conversation_id: responseConvId,
                message_role: "dual_provider",
                model: `${dispatcherModel} + ${convModel}`,
                provider: "openai+gemini",
                prompt_tokens: totalPrompt,
                completion_tokens: totalCompletion,
                total_tokens: totalPrompt + totalCompletion,
                metadata: { dispatcher: dispatcherUsage, conversational: conversationalUsage },
              });
            } catch (dbErr) {
              console.warn("[Chat-Local] Failed to save token usage:", (dbErr as Error)?.message);
            }
          }
          if (phase1ToolCalls.length === 0) {
            const noToolsEntry = { type: "dispatcher_no_tools", model: convModel, dispatcher: dispatcherUsage, conversational: conversationalUsage };
            dualDebugAccum.push(noToolsEntry);
            sendSse({ debug: [noToolsEntry] });
          }

          if (!skipSave && responseConvId && dualContentToSave.trim()) {
            try {
              const dualMeta: Record<string, unknown> = {
                ...(isFirstContact && welcomeVideoUrl ? { type: "welcome_video", video_url: welcomeVideoUrl } : {}),
                ...(dualDebugAccum.length > 0 ? { debug: dualDebugAccum } : {}),
                ...((dispatcherUsage || conversationalUsage) ? { token_usage: tokenUsagePayload } : {}),
                ...(dualPhotosSent.length > 0 ? { photos_sent: dualPhotosSent } : {}),
              };
              await supabase.rpc("save_message", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
                p_role: "assistant",
                p_content: dualContentToSave.trim(),
                p_model: null,
                p_tokens_input: 0,
                p_tokens_output: 0,
                p_latency_ms: null,
                p_metadata: Object.keys(dualMeta).length > 0 ? dualMeta : undefined,
              });
            } catch (saveErr) {
              console.warn("[Chat-Local] save_message (dual) failed:", (saveErr as Error)?.message);
            }
          }

          const hasHandoff = handoffAssigneeId != null || handoffTeamId != null;
          sendSse(hasHandoff ? { conversation_id: responseConvId, handoff_assignee_id: handoffAssigneeId ?? undefined, handoff_team_id: handoffTeamId ?? undefined } : { conversation_id: responseConvId });
          sendSse("[DONE]");
          reply.raw.end();
          return;
        }
      }

      let llmMessages = toOpenAIMessages(systemPrompt, messagesToUse);
      const hasAssignToolSP = tools.some((t) => t.tool_type === "chatwoot_assign");
      const assignHintSP = buildAutoescolaIdealAssignHint(messagesToUse, hasAssignToolSP, tenantSlug);
      const leadHintSP = buildLeadHint(messagesToUse, leadLabelEnabled);
      const hintsSP = [assignHintSP, leadHintSP].filter(Boolean).join("\n");
      if (hintsSP && useTools) {
        for (let i = llmMessages.length - 1; i >= 0; i--) {
          const m = llmMessages[i] as { role?: string; content?: string };
          if (m?.role === "user" && "content" in m) {
            (llmMessages[i] as { role: string; content: string }).content =
              `${m.content || ""}\n\n[CONTEXTO ADICIONAL]\n${hintsSP.trim()}`;
            break;
          }
        }
      }
      let fullContent = "";
      let iteration = 0;
      let singleProviderUsageAccum = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      let handoffAssigneeIdSP: number | null = null;
      let handoffTeamIdSP: number | null = null;

      while (iteration < MAX_TOOL_ITERATIONS) {
        iteration++;

        const baseSP = providerConfig.baseUrl.replace(/\/+$/, "");
        const isGeminiBaseSP = /generativelanguage\.googleapis\.com/i.test(baseSP);
        const todayISOSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const body: Record<string, unknown> = {
          model,
          messages: llmMessages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: agent.temperature ?? 0.7,
          ...(promptCachingEnabledEarly && !isGeminiBaseSP && { prompt_cache_key: `agent:${agent_id}:tenant:${tenantSlug || "default"}:date:${todayISOSP}` }),
        };

        // Gemini 2.5+: thinking já ativo por padrão no modelo.
        // Google recomenda temperature=1.0 para modelos 2.5 com thinking.
        if (isGeminiBaseSP && isGeminiThinkingModel(model)) {
          body.temperature = 1.0;
        }

        if (useTools && iteration === 1) {
          body.tools = openaiTools;
          body.tool_choice = "auto";
        }

        // Gemini: endpoint OpenAI-compatible é /openai/chat/completions
        const base = baseSP;
        const isGeminiBase = isGeminiBaseSP;
        const apiUrl =
          isGeminiBase && !base.includes("/openai")
            ? `${base}/openai/chat/completions`
            : `${base}/chat/completions`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerConfig.apiKey}`,
        };

        const chatResp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!chatResp.ok) {
          const errText = await chatResp.text();
          sendSse({ error: providerErrorMessage(chatResp.status, errText) });
          reply.raw.end();
          return;
        }

        const reader = chatResp.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let content = "";
        let streamFilterBuffer = "";
        const toolCallsAccum: Record<number, { id: string; name: string; args: string }> = {};
        let iterUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

        while (true) {
          const { done, value } = await reader.read();
          buf += decoder.decode(value || new Uint8Array(), { stream: !done });

          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);

            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6);
              if (!jsonStr || jsonStr === "[DONE]") continue;

              try {
                const ev = JSON.parse(jsonStr);
                if (ev.usage) {
                  iterUsage = {
                    prompt_tokens: ev.usage.prompt_tokens ?? 0,
                    completion_tokens: ev.usage.completion_tokens ?? 0,
                    total_tokens: ev.usage.total_tokens ?? 0,
                  };
                }
                const delta = ev.choices?.[0]?.delta;

                if (delta?.content) {
                  content += delta.content;
                  const { toSend, newBuffer } = filterCommandLinesFromStream(streamFilterBuffer, delta.content);
                  streamFilterBuffer = newBuffer;
                  if (toSend) sendSse({ choices: [{ delta: { content: restorePortugueseAccents(toSend) } }] });
                }

                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsAccum[idx]) {
                      toolCallsAccum[idx] = {
                        id: tc.id || `call_${idx}`,
                        name: tc.function?.name || "",
                        args: tc.function?.arguments || "",
                      };
                    } else {
                      if (tc.id) toolCallsAccum[idx].id = tc.id;
                      if (tc.function?.name) toolCallsAccum[idx].name = tc.function.name;
                      if (tc.function?.arguments) toolCallsAccum[idx].args += tc.function.arguments;
                    }
                  }
                }
              } catch {
                /* skip */
              }
            }
          }
          if (done) {
            // Echo guard para single-provider: se a resposta for um echo da mensagem do cliente, usar fallback
            if (streamFilterBuffer) {
              const bufferContent = restorePortugueseAccents(streamFilterBuffer);
              const lastUserContent = lastUserMsg?.role === "user" ? (lastUserMsg.content?.trim() ?? "") : "";
              if (isEchoResponse(bufferContent, lastUserContent)) {
                console.warn("[Chat-Local] Echo detectado (single-provider):", bufferContent.slice(0, 50), "- usando fallback");
                const fallback = "Pode me dar mais detalhes sobre o que você precisa?";
                sendSse({ choices: [{ delta: { content: fallback } }] });
                content = fallback; // substitui acumulador para que fullContent fique correto
                streamFilterBuffer = ""; // limpa para não duplicar
              } else {
                sendSse({ choices: [{ delta: { content: bufferContent } }] });
              }
            }
            const isFirstContact = messagesToUse.filter((m) => m.role === "assistant").length === 0;
            const agentCfgSingle = (agent?.config || {}) as Record<string, unknown>;
            const hasWelcomeVideoSingle = !!(agentCfgSingle.welcome_video_url as string)?.trim();
            const nameQuestionSingle = (agentCfgSingle.welcome_name_question as string) || "Como posso te chamar?";
            const alreadyHasNameQuestionSingle =
              content.toLowerCase().includes(nameQuestionSingle.toLowerCase()) ||
              content.toLowerCase().includes("com quem eu falo?");
            const clientAlreadyGaveNameSingle = userHasProvidedNameInMessages(messagesToUse);
            const isSandboxSingle = !chatwoot_conversation_id;
            const shouldAddNameQuestionSingle = isFirstContact && nameQuestionSingle && !alreadyHasNameQuestionSingle && !clientAlreadyGaveNameSingle;
            if (shouldAddNameQuestionSingle && (isSandboxSingle || !hasWelcomeVideoSingle)) {
              const nqContentSingle = "\n\n" + nameQuestionSingle;
              content += nqContentSingle;
              sendSse({ choices: [{ delta: { content: nqContentSingle } }] });
            }
            break;
          }
        }

        if (iterUsage) {
          singleProviderUsageAccum.prompt_tokens += iterUsage.prompt_tokens;
          singleProviderUsageAccum.completion_tokens += iterUsage.completion_tokens;
          singleProviderUsageAccum.total_tokens += iterUsage.total_tokens;
        }

        const toolCalls = Object.values(toolCallsAccum)
          .filter((tc) => tc.name)
          .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }));

        fullContent += content;

        if (toolCalls.length === 0) {
          if (/HANDOFF_COMERCIAL/i.test(fullContent)) {
            sendHandoffNotification(agent_id, agent, messagesToUse, external_user_id).catch((e) => {
              console.warn("[Chat-Local] Erro ao enviar notificação de handoff (single-provider):", (e as Error)?.message);
            });
            if (responseConvId) {
              supabase.rpc("cancel_pending_followups", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
                p_cancel_reason: "user_replied",
              }).then(
                ({ data: cancelled }) => {
                  if (cancelled != null && (cancelled as number) > 0) {
                    console.log("[Chat-Local] Follow-up(s) cancelado(s) no handoff (single-provider):", cancelled);
                  }
                },
                (e: unknown) => {
                  console.warn("[Chat-Local] Erro ao cancelar follow-up no handoff (single-provider):", (e as Error)?.message);
                }
              );
            }
          }
          if (singleProviderUsageAccum.total_tokens > 0) {
            sendSse({ token_usage: { single: { ...singleProviderUsageAccum, model } } });
            try {
              await supabase.from("agent_token_usage").insert({
                agent_id,
                conversation_id: responseConvId,
                message_role: "single",
                model,
                provider: isGeminiProvider ? "gemini" : "openai",
                prompt_tokens: singleProviderUsageAccum.prompt_tokens,
                completion_tokens: singleProviderUsageAccum.completion_tokens,
                total_tokens: singleProviderUsageAccum.total_tokens,
                metadata: { iterations: iteration },
              });
            } catch (dbErr) {
              console.warn("[Chat-Local] Failed to save token usage:", (dbErr as Error)?.message);
            }
          }
          sendSse({ debug: [{ type: "single_provider", model, ...singleProviderUsageAccum }] });
          const singleContentToSave = sanitizeLLMOutput(fullContent.trim());
          // Extrair fotos enviadas para persistir em metadata
          const singlePhotosSent: Array<{ id: string; name: string }> = [];
          {
            const spPhotoRegex = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)\s*\|\s*id:\s*([a-f0-9-]{36})/gi;
            let spMatch: RegExpExecArray | null;
            while ((spMatch = spPhotoRegex.exec(fullContent)) !== null) {
              const [, photoName, photoId] = spMatch;
              if (photoId && !singlePhotosSent.some((p) => p.id === photoId)) {
                singlePhotosSent.push({ id: photoId, name: (photoName ?? "").trim() });
              }
            }
          }
          if (!skipSave && responseConvId && singleContentToSave) {
            // #region agent log
            fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'12d224'},body:JSON.stringify({sessionId:'12d224',location:'chat-local.ts:save_message_single',message:'chat-local save_message (single)',data:{convId:responseConvId,contentLen:singleContentToSave.length,contentPreview:singleContentToSave.slice(0,120)},timestamp:Date.now(),hypothesisId:'H1,H2'})}).catch(()=>{});
            // #endregion
            try {
              const singleMeta: Record<string, unknown> = {
                ...(isFirstContact && welcomeVideoUrl ? { type: "welcome_video", video_url: welcomeVideoUrl } : {}),
                debug: [{ type: "single_provider", model, ...singleProviderUsageAccum }],
                ...(singleProviderUsageAccum.total_tokens > 0 ? {
                  token_usage: { single: { ...singleProviderUsageAccum, model } },
                } : {}),
                ...(singlePhotosSent.length > 0 ? { photos_sent: singlePhotosSent } : {}),
              };
              await supabase.rpc("save_message", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
                p_role: "assistant",
                p_content: singleContentToSave,
                p_model: null,
                p_tokens_input: 0,
                p_tokens_output: 0,
                p_latency_ms: null,
                p_metadata: Object.keys(singleMeta).length > 0 ? singleMeta : undefined,
              });
            } catch (saveErr) {
              console.warn("[Chat-Local] save_message (single, no tools) failed:", (saveErr as Error)?.message);
            }
          }
          sendSse({ conversation_id: responseConvId });
          sendSse("[DONE]");
          reply.raw.end();
          return;
        }

        const assistantMsg: { role: "assistant"; content: string; tool_calls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> } = {
          role: "assistant",
          content: content || "",
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
        llmMessages.push(assistantMsg);

        const agendaCriarCacheSP = new Map<string, { result: unknown; success: boolean }>();
        let sendNotificationExecutedThisTurnSP = false;

        for (const tc of toolCalls) {
          const tool = nameToTool.get(tc.function.name);
          if (!tool) {
            console.warn("[Chat-Local] Tool não encontrada (single-provider):", tc.function.name);
            llmMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ error: "Tool not found" }),
            });
            continue;
          }

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }

          const isEstoqueEmptySP = tc.function.name === "consultar_estoque" && Object.keys(args).length === 0;
          if (isEstoqueEmptySP) {
            const recentTextSP = messagesToUse
              .slice(-8)
              .map((m) => (m.content ?? ""))
              .join("\n");
            const fallbackEntitiesSP = extractVehicleEntities(recentTextSP);
            if (fallbackEntitiesSP.marca || fallbackEntitiesSP.modelo) {
              args = { ...args };
              if (fallbackEntitiesSP.marca) args.marca = fallbackEntitiesSP.marca;
              if (fallbackEntitiesSP.modelo) args.modelo = fallbackEntitiesSP.modelo;
              if (fallbackEntitiesSP.ano) args.ano = fallbackEntitiesSP.ano;
              console.log("[Chat-Local] consultar_estoque args vazios (single-provider): fallback extraiu do histórico:", JSON.stringify(args));
            } else {
              console.warn("[Chat-Local] consultar_estoque BLOQUEADO (single-provider): args vazios e nenhum veículo no histórico.");
              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: "consultar_estoque chamado com args vazios {}. Você DEVE especificar pelo menos marca ou modelo. Analise o histórico da conversa para identificar o veículo discutido." }),
              });
              continue;
            }
          }

          const agendaActionSP = String(args.action ?? "check_availability");
          const isAgendaCriarSP = tc.function.name === "consultar_agenda" && (agendaActionSP === "criar" || agendaActionSP === "create");
          if (isAgendaCriarSP) {
            const startAt = String(args.start_at ?? args.start ?? args.date_time ?? "").trim();
            const title = String(args.title ?? args.titulo ?? "").trim();
            const dedupeKey = `${startAt}|${title}`;
            const cached = agendaCriarCacheSP.get(dedupeKey);
            if (cached) {
              console.log("[Chat-Local] consultar_agenda(criar) duplicada ignorada (single-provider):", dedupeKey);
              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(cached.success ? cached.result : { error: cached.result }),
              });
              continue;
            }
          }

          if (tool.tool_type === "chatwoot_assign" || tool.tool_type === "marcar_lead") {
            if (responseConvId) args = { ...args, conversation_id: responseConvId };
            if (chatwoot_conversation_id != null) args = { ...args, chatwoot_conversation_id };
          }
          if (tool.tool_type === "chatwoot_assign") {
            // Quando o LLM não envia assignee_id/team_id, usar os padrões da config (team_id é essencial quando não há assignee)
            const cfg = (tool.execution_config || {}) as Record<string, unknown>;
            if (args.assignee_id == null && cfg.assignee_id != null) args = { ...args, assignee_id: cfg.assignee_id };
            if (args.team_id == null && cfg.team_id != null) args = { ...args, team_id: cfg.team_id };
            // Injetar reason das últimas mensagens do cliente para casar regras por unidade
            const reasonSP = String(args?.reason || "").trim();
            if ((!reasonSP || reasonSP === "escalation") && messagesToUse.length > 0) {
              let userMsgsSP = messagesToUse
                .filter((m) => (m as { role?: string }).role === "user")
                .map((m) => (m as { content?: string }).content ?? "")
                .filter((content) => !content.includes("[SISTEMA INTERNO"))
                .slice(-3)
                .join(" ")
                .trim();
              if (isAutoescolaIdealEarly && userMsgsSP) {
                for (const [alias, canonical] of Object.entries(IDEAL_UNITS_MAP)) {
                  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  userMsgsSP = userMsgsSP.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
                }
              }
              if (userMsgsSP) args = { ...args, reason: userMsgsSP };
            }
          }
          if (tool.tool_type === "nearest_unit" || tool.tool_type === "consultar_unidade") {
            if (!args.cep || String(args.cep).trim() === "") {
              const recentTextSP = messagesToUse
                .slice(-30)
                .map((m) => (m.content ?? ""))
                .join(" ");
              const cepFallbackSP = extractCepFromText(recentTextSP);
              if (cepFallbackSP) {
                args = { ...args, cep: cepFallbackSP };
                console.log("[Chat-Local] consulta CEP/unidade sem cep (single-provider): injetado do histórico:", cepFallbackSP);
              }
            }
            if (!args.tenant_id && agent?.tenant_id) {
              args = { ...args, tenant_id: agent.tenant_id };
            }
          }
          if (isEnviarNotificacaoTool(tool)) {
            args = enrichEnviarNotificacaoArgs(messagesToUse, external_user_id, args);
          }
          console.log("[Chat-Local] Executando tool (single-provider):", tc.function.name, "| args:", JSON.stringify(args));
          const result = await executeTool(tool, args, agent_id);
          const resultPreview = result.success
            ? (typeof result.result === "object" ? JSON.stringify(result.result).slice(0, 200) : String(result.result).slice(0, 200))
            : result.error;
          console.log("[Chat-Local] Resultado tool", tc.function.name, "| success:", result.success, "| preview:", resultPreview);
          llmMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result.success ? result.result : { error: result.error }),
          });
          if (tc.function.name === "consultar_agenda") {
            const agendaActionDoneSP = String(args.action ?? "check_availability");
            if (agendaActionDoneSP === "criar" || agendaActionDoneSP === "create") {
              const startAt = String(args.start_at ?? args.start ?? args.date_time ?? "").trim();
              const title = String(args.title ?? args.titulo ?? "").trim();
              agendaCriarCacheSP.set(`${startAt}|${title}`, {
                result: result.success ? result.result : result.error,
                success: result.success,
              });
            }
            if (result.success && result.result) {
              sendAgendaNotification(agent_id, agent, result.result, messagesToUse, external_user_id, responseConvId, chatwoot_conversation_id).catch(() => {});
            }
          }
          if (tool.tool_type === "send_notification" && result.success) {
            sendNotificationExecutedThisTurnSP = true;
          }
          if (tool.tool_type === "chatwoot_assign" && result.success && responseConvId) {
            const resSP = result.result as { assignee_id?: number | null; team_id?: number | null };
            if (resSP.assignee_id != null) handoffAssigneeIdSP = resSP.assignee_id;
            if (resSP.team_id != null) handoffTeamIdSP = resSP.team_id;
            if (!sendNotificationExecutedThisTurnSP) {
              sendHandoffNotification(agent_id, agent, messagesToUse, external_user_id).then(() => {}, () => {});
            }
            supabase.rpc("cancel_pending_followups", {
              p_agent_id: agent_id,
              p_conversation_id: responseConvId,
              p_cancel_reason: "human_assigned",
            }).then(() => {}, () => {});
          }
        }
      }

      if (singleProviderUsageAccum.total_tokens > 0) {
        sendSse({ token_usage: { single: { ...singleProviderUsageAccum, model } } });
        try {
          await supabase.from("agent_token_usage").insert({
            agent_id,
            conversation_id: responseConvId,
            message_role: "single",
            model,
            provider: isGeminiProvider ? "gemini" : "openai",
            prompt_tokens: singleProviderUsageAccum.prompt_tokens,
            completion_tokens: singleProviderUsageAccum.completion_tokens,
            total_tokens: singleProviderUsageAccum.total_tokens,
            metadata: { iterations: iteration },
          });
        } catch (dbErr) {
          console.warn("[Chat-Local] Failed to save token usage:", (dbErr as Error)?.message);
        }
      }
      sendSse({ debug: [{ type: "single_provider", model, ...singleProviderUsageAccum }] });
      const finalContentToSave = sanitizeLLMOutput(fullContent.trim());
      // Extrair fotos enviadas para persistir em metadata
      const finalPhotosSent: Array<{ id: string; name: string }> = [];
      {
        const fpPhotoRegex = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)\s*\|\s*id:\s*([a-f0-9-]{36})/gi;
        let fpMatch: RegExpExecArray | null;
        while ((fpMatch = fpPhotoRegex.exec(fullContent)) !== null) {
          const [, photoName, photoId] = fpMatch;
          if (photoId && !finalPhotosSent.some((p) => p.id === photoId)) {
            finalPhotosSent.push({ id: photoId, name: (photoName ?? "").trim() });
          }
        }
      }
      if (!skipSave && responseConvId && finalContentToSave) {
        try {
          const finalSingleMeta: Record<string, unknown> = {
            ...(isFirstContact && welcomeVideoUrl ? { type: "welcome_video", video_url: welcomeVideoUrl } : {}),
            debug: [{ type: "single_provider", model, ...singleProviderUsageAccum }],
            ...(singleProviderUsageAccum.total_tokens > 0 ? {
              token_usage: { single: { ...singleProviderUsageAccum, model } },
            } : {}),
            ...(finalPhotosSent.length > 0 ? { photos_sent: finalPhotosSent } : {}),
          };
          await supabase.rpc("save_message", {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
            p_role: "assistant",
            p_content: finalContentToSave,
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
            p_metadata: Object.keys(finalSingleMeta).length > 0 ? finalSingleMeta : undefined,
          });
        } catch (saveErr) {
          console.warn("[Chat-Local] save_message (single, with tools) failed:", (saveErr as Error)?.message);
        }
      }
      const hasHandoffSP = handoffAssigneeIdSP != null || handoffTeamIdSP != null;
      sendSse(hasHandoffSP ? { conversation_id: responseConvId, handoff_assignee_id: handoffAssigneeIdSP ?? undefined, handoff_team_id: handoffTeamIdSP ?? undefined } : { conversation_id: responseConvId });
      sendSse("[DONE]");
      reply.raw.end();
    }
  );
}
