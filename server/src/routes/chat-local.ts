import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { buildSystemPrompt, getDispatcherPrompt } from "../services/prompts/registry.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";
import { filterCommandLinesFromStream, sanitizeLLMOutput, fallbackSanitizeForRetry } from "../utils/sanitize.js";
import { emitMediaCommandsSseIfNeeded } from "../utils/extract-media-commands.js";
import { injectSuiteGalleryMarkdownIfMissing, injectSuiteGalleryVideosIfMissing } from "../utils/suite-gallery-markdown-inject.js";
import { injectOmnibeesQuotePhotosIfMissing } from "../utils/omnibees-photo-markdown.js";
import { getWelcomeConversationImageMarkdown } from "../utils/suite-gallery-welcome-image.js";
import { formatDateBR, buildFallbackAgendaNotification, buildCancelNotification, buildHandoffNotification, extractClientNameFromMessages, toBrasiliaISO } from "../utils/agendaNotification.js";

const MSG_SPLIT = "<<MSG_SPLIT>>";
const MAX_TOOL_ITERATIONS = 5;

/** Quando modelos Gemini 2.5 / *-lite devolvem 503 (alta demanda na API), tentar este modelo na mesma chave. */
const GEMINI_CONVERSATIONAL_FALLBACK_MODEL = "gemini-2.0-flash";

/** Mensagem amigável quando a API do provedor (OpenAI/Gemini) retorna erro HTTP */
function providerErrorMessage(status: number, errText: string): string {
  const preview = errText.slice(0, 200).replace(/\s+/g, " ").trim();
  if (status === 401) return "API key inválida ou expirada (401). Verifique o provedor em Provedores e atualize a chave.";
  if (status === 403) return "Acesso negado pelo provedor de IA (403). Verifique a API key e permissões em Provedores.";
  if (status === 429) return "Limite de uso do provedor excedido (429). Tente mais tarde ou verifique o plano/créditos.";
  if (status === 503) {
    if (/high demand|UNAVAILABLE|overloaded/i.test(errText)) {
      return "O provedor de IA está temporariamente sobrecarregado (503). Tente de novo em instantes ou, no agente, use o modelo gemini-2.0-flash (costuma ser mais estável na API do que 2.5 / *-lite).";
    }
    return `Serviço temporariamente indisponível (503). Tente novamente em alguns minutos. ${preview ? `Detalhe: ${preview}` : ""}`;
  }
  if (status >= 500) return `Erro interno do provedor (${status}). Tente novamente em alguns minutos.`;
  return preview || `Erro do provedor (${status}). Verifique a API key em Provedores.`;
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
      if (provider.api_key_encrypted && process.env.ENCRYPTION_KEY) {
        try {
          console.log("[Chat-Local] Descriptografando chave do provider:", providerId);
          const { decrypt } = await import("../services/crypto.js");
          apiKey = await decrypt(provider.api_key_encrypted, process.env.ENCRYPTION_KEY);
          console.log("[Chat-Local] Chave descriptografada com sucesso, length:", apiKey.length);
        } catch (err) {
          console.error("[Chat-Local] Falha ao descriptografar chave do provider:", providerId, err);
          const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
          apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
          if (apiKey) {
            console.log("[Chat-Local] Usando fallback de env var, length:", apiKey.length, "isGemini:", isGemini);
          }
        }
      } else {
        const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
        apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
        if (apiKey) {
          console.log("[Chat-Local] Usando chave de env var (sem encryption), length:", apiKey.length, "isGemini:", isGemini);
        }
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

// ── nearest_unit / consultar_unidade guard ─────────────────────────────────

const NEAREST_UNIT_TOOL_NAMES = new Set([
  "consultar_unidade",
  "consultar_cep",
  "nearest_unit",
]);

function isNearestUnitTool(toolName: string): boolean {
  return NEAREST_UNIT_TOOL_NAMES.has(toolName);
}

/** Extrai CEP (8 dígitos) do histórico de mensagens do usuário */
function extractCepFromMessages(messages: Array<{ role: string; content: string }>): string | null {
  const CEP_RE = /\b(\d{5})-?(\d{3})\b/;
  // Percorre mensagens do usuário do mais recente para o mais antigo
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const m = (messages[i].content || "").match(CEP_RE);
    if (m) return m[1] + m[2];
  }
  return null;
}

// ── Vale Suíço / Omnibees guards ───────────────────────────────────────────

const OMNIBEES_TOOL_NAMES = new Set([
  "consultar_disponibilidade_vale_suico",
  "consultar_disponibilidade",
  "omnibees_availability",
]);

function isOmnibeesTool(toolName: string): boolean {
  return OMNIBEES_TOOL_NAMES.has(toolName);
}

/**
 * Detecta se o usuário forneceu de forma explícita o número de adultos no histórico.
 * Trata variações como "2 adultos", "duas pessoas", "casal", "só nós dois", "eu e minha esposa", etc.
 */
function userProvidedAdultsCount(messages: Array<{ role: string; content: string }>): boolean {
  const userMsgs = messages.filter((m) => m?.role === "user").map((m) => (m.content || "").toLowerCase());
  const joined = userMsgs.join(" \n ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(\d+)\s*(adultos?|pessoas?|hospedes?|hóspedes?|adulto)\b/.test(joined)) return true;
  if (/\b(uma|duas|dois|tres|tr[eê]s|quatro|cinco|seis)\s*(adultos?|pessoas?|hospedes?)\b/.test(joined)) return true;
  if (/\b(somos|seremos|vamos|estamos|iremos)\s*(em|nos)?\s*(\d+|uma|duas|dois|tr[eê]s|quatro)\b/.test(joined)) return true;
  if (/\b(s[oó]\s+(n[oó]s|eu|nosso)\s+dois|n[oó]s\s+dois|casal|os\s+dois|s[oó]\s+(eu|n[oó]s))\b/.test(joined)) return true;
  if (/\b(eu\s+e\s+(meu|minha|a\s+|o\s+))/.test(joined)) return true;
  if (/\b(viajo\s+sozinho|vou\s+sozinho|vou\s+sozinha|viagem\s+solo)\b/.test(joined)) return true;
  return false;
}

/**
 * Detecta se o usuário forneceu situação de crianças de forma explícita.
 */
function userProvidedChildrenStatus(messages: Array<{ role: string; content: string }>): boolean {
  const userMsgs = messages.filter((m) => m?.role === "user").map((m) => (m.content || "").toLowerCase());
  const joined = userMsgs.join(" \n ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(\d+)\s*(crian[cç]as?|filhos?|bebes?|beb[eê]s?|kids)\b/.test(joined)) return true;
  if (/\b(uma|duas|dois|tres|tr[eê]s)\s*(crian[cç]as?|filhos?)\b/.test(joined)) return true;
  if (/\b(sem|n[ãa]o\s+tem|nenhuma|zero)\s*(crian[cç]a|filho)/.test(joined)) return true;
  // Grupo só de adultos (equivale a 0 crianças): "somente 2 adultos", "só nós dois", "apenas adultos"
  if (/\b(somente|apenas)\s+(\d+\s+)?adultos?\b/.test(joined)) return true;
  if (/\bs[oó]\s+(\d+\s+)?adultos?\b/.test(joined)) return true;
  if (/\bs[oó]\s*(adulto|nos\s+dois|os\s+dois|n[oó]s\s+dois|eu)\b/.test(joined)) return true;
  if (/\bcasal\b/.test(joined) && !/crian[cç]a|filho|beb[eê]/.test(joined)) return true;
  if (/\bsozinh[oa]\b/.test(joined)) return true;
  if (/\b\d+\s*anos?\b/.test(joined) && /crian[cç]a|filho|beb[eê]/.test(joined)) return true;
  return false;
}

/**
 * Guarda determinístico para Omnibees: bloqueia chamada se ocupação não está explícita
 * no histórico (proteção contra dispatcher chutar adults=2 / children=0).
 */
function validateOmnibeesArgs(
  args: Record<string, unknown>,
  messages: Array<{ role: string; content: string }>
): { ok: true } | { ok: false; error: string } {
  const checkIn = args.checkIn ?? args.check_in ?? args.CheckIn;
  const checkOut = args.checkOut ?? args.check_out ?? args.CheckOut;
  if (!checkIn || !checkOut) {
    return { ok: false, error: "checkIn e checkOut são obrigatórios. Pergunte ao cliente as datas exatas antes de consultar." };
  }
  const adults = args.adults;
  const hasAdultsInArgs = adults !== undefined && adults !== null && adults !== "";
  if (!hasAdultsInArgs && !userProvidedAdultsCount(messages)) {
    return {
      ok: false,
      error:
        "PROIBIDO consultar Omnibees sem número de adultos explícito do cliente. " +
        "O dispatcher NÃO deve chutar adults=2. Pergunte ao cliente quantos adultos vão no total antes de consultar. " +
        "PROIBIDO ABSOLUTO citar valores em R$, nomes de quartos com preços ou parcelamento. " +
        "Responda em texto sem nenhum valor, perguntando quantos adultos vão.",
    };
  }
  const children = args.children;
  const hasChildrenInArgs = children !== undefined && children !== null && children !== "";
  if (!hasChildrenInArgs && !userProvidedChildrenStatus(messages)) {
    return {
      ok: false,
      error:
        "PROIBIDO consultar Omnibees sem situação de crianças explícita. " +
        "O dispatcher NÃO deve assumir 0 crianças. Pergunte ao cliente se vai criança e, se sim, quantas e idades. " +
        "PROIBIDO ABSOLUTO citar valores em R$. Responda em texto sem nenhum valor, perguntando sobre crianças.",
    };
  }
  return { ok: true };
}

/**
 * Guarda anti-alucinação: se a Omnibees falhou ou retornou sem rooms,
 * monta payload com prohibition explícito para o conversacional.
 */
function buildOmnibeesGuardedContent(toolName: string, result: { success: boolean; result: unknown; error?: string }): string {
  if (!isOmnibeesTool(toolName)) {
    return JSON.stringify(result.success ? result.result : { error: result.error });
  }
  if (!result.success) {
    return JSON.stringify({
      error: result.error || "Falha ao consultar Omnibees",
      _prohibition:
        "PROIBIDO ABSOLUTO citar qualquer valor em R$, nome de quarto com preço, parcelamento, regime ou qualquer dado tarifário. " +
        "A consulta de disponibilidade FALHOU neste turno. NÃO invente tarifas. " +
        "Responda ao cliente em texto consultivo sem nenhum valor — informe que vai verificar a disponibilidade ou peça os dados que faltam (datas exatas, adultos, crianças, idades).",
    });
  }
  const obj = (result.result || {}) as Record<string, unknown>;
  const rooms = Array.isArray(obj.rooms) ? obj.rooms : [];
  if (rooms.length === 0) {
    return JSON.stringify({
      ...obj,
      _prohibition:
        "Resultado SEM disponibilidade (rooms vazio). PROIBIDO ABSOLUTO citar qualquer valor em R$ ou nome de quarto. " +
        "Diga ao cliente com transparência que para essas datas a consulta não trouxe tarifa, e ofereça uma alternativa (outras datas próximas) sem inventar nenhum valor.",
    });
  }
  return JSON.stringify(obj);
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
    return `Erro: ${err}\n\nO agendamento NÃO foi feito. NÃO confirme ao cliente. Informe o problema de forma breve e corrija os dados antes de tentar novamente.`;
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
      ? `Horários disponíveis:\n${parts.join("\n")}`
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
  const vehicles = obj.vehicles as Array<{ id?: string; nome_completo?: string; ano?: number; preco?: number; preco_formatado?: string; km?: number; cor?: string; photos_markdown?: string }> | undefined;
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
      lines.push("FOTOS (quando o cliente pedir ou aceitar ver fotos, inclua na sua resposta APENAS o bloco do veículo escolhido — use ENVIAR_FOTOS_VEICULO: nome | id: uuid):");
      for (const v of vehicles) {
        if (v.photos_markdown && v.photos_markdown.trim()) {
          lines.push("");
          lines.push(`--- Fotos do veículo: ${v.nome_completo ?? "?"} (id: ${v.id ?? "?"}) ---`);
          lines.push(v.photos_markdown);
        }
      }
    } else if (photosMarkdown && photosMarkdown.trim()) {
      lines.push("");
      lines.push("FOTOS (copie o bloco abaixo literalmente na sua resposta quando o cliente pedir ou aceitar ver fotos):");
      lines.push(photosMarkdown);
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
  // suite_gallery_query: repassar photos_markdown integralmente para que o conversacional possa incluir as fotos
  if (Array.isArray(obj.galleries)) {
    const galleries = obj.galleries as Array<{
      nome?: string;
      rotulo_para_cliente?: string | null;
      exibir_no_catalogo_cliente?: boolean;
      photos_markdown?: string;
      videos?: Array<{ url: string; llm_send_when?: string; caption?: string }>;
    }>;
    const hint = typeof obj._hint === "string" ? obj._hint : "";
    const lines: string[] = [];
    if (hint) lines.push(hint);
    for (const g of galleries) {
      if (g.rotulo_para_cliente) {
        lines.push(`\nÁrea (falar assim com o cliente): ${g.rotulo_para_cliente}`);
      } else if (g.exibir_no_catalogo_cliente === false) {
        lines.push("\n[Mídia operacional — não oferecer como opção na lista de fotos ao cliente]");
      } else if (g.nome) {
        lines.push(`\nGaleria: ${g.nome}`);
      }
      if (g.photos_markdown && g.photos_markdown.trim()) {
        lines.push("FOTOS (inclua o bloco abaixo integralmente na resposta quando o cliente pediu ver as fotos):");
        lines.push(g.photos_markdown);
      }
      if (g.videos && g.videos.length > 0) {
        const anyWhen = g.videos.some((v) => v.llm_send_when?.trim());
        lines.push(
          anyWhen
            ? "VÍDEOS — use o critério llm_send_when de cada item; envie só a(s) URL(s) adequada(s) ao contexto:"
            : "VÍDEOS (URLs — uma por linha):"
        );
        for (const v of g.videos) {
          if (v.llm_send_when?.trim()) {
            lines.push(`- Critério: ${v.llm_send_when.trim().replace(/\s+/g, " ")}`);
          }
          lines.push(`  ${v.url}`);
        }
      }
    }
    return lines.join("\n") || JSON.stringify(obj).slice(0, 300);
  }
  // Omnibees / consultar_disponibilidade_vale_suico: o conversacional PRECISA do summaryText inteiro
  // (todas as suítes, parcelado, horários). Truncar quebrava orçamentos com 2+ acomodações.
  if (typeof obj.summaryText === "string" && obj.summaryText.trim()) {
    const hasOmnibeesShape =
      typeof obj.bookingUrl === "string" ||
      typeof obj.hotelListingUrl === "string" ||
      Array.isArray(obj.rooms) ||
      typeof obj.checkIn === "string";
    if (hasOmnibeesShape) {
      const lines: string[] = [];
      if (typeof obj.roomCount === "number") {
        lines.push(
          `ACOMODACOES_COM_TARIFA (roomCount=${obj.roomCount}): cite TODAS as categorias abaixo ao cliente, com à vista e parcelado quando constar em cada linha.`
        );
      }
      lines.push("CONSULTA OMNIBEES — use os dados abaixo por completo (não resuma a uma suíte só):");
      lines.push(String(obj.summaryText).trim());
      if (typeof obj.bookingUrl === "string" && obj.bookingUrl.trim()) {
        lines.push(`bookingUrl (enviar ao cliente somente se ele pedir link/reserva): ${obj.bookingUrl.trim()}`);
      }
      return lines.join("\n");
    }
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
async function sendNotificationToGroup(
  agentId: string,
  agent: { config?: Record<string, unknown>; tenant_id?: string },
  message: string
): Promise<void> {
  const supabase = createNexusClient();
  try {
    const { data: notifTools } = await supabase
      .from("tools")
      .select("id, tool_type, execution_config")
      .eq("tool_type", "send_notification")
      .limit(10);

    if (!notifTools || notifTools.length === 0) {
      console.warn("[Chat-Local] Nenhuma tool send_notification encontrada");
      return;
    }

    const { data: agentToolLinks } = await supabase
      .from("agent_tools")
      .select("tool_id")
      .eq("agent_id", agentId);
    const linkedToolIds = new Set((agentToolLinks || []).map((l: { tool_id: string }) => l.tool_id));

    const notifTool = notifTools.find((t: { id: string }) => linkedToolIds.has(t.id)) || notifTools[0];
    const execCfg = (notifTool.execution_config || {}) as Record<string, unknown>;
    const targetConvId = execCfg.conversation_id;

    if (!targetConvId) {
      console.warn("[Chat-Local] Tool send_notification sem conversation_id configurado");
      return;
    }

    const cfg = (agent.config || {}) as Record<string, string>;
    const cwUrl = cfg.chatwoot_url;
    const cwToken = cfg.chatwoot_api_token;
    const cwAccountId = cfg.chatwoot_account_id;

    if (!cwUrl || !cwToken || !cwAccountId) {
      console.warn("[Chat-Local] Chatwoot não configurado no agente para notificação");
      return;
    }

    const baseUrl = cwUrl.replace(/\/+$/, "");
    const msgUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${targetConvId}/messages`;

    const resp = await fetch(msgUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", api_access_token: cwToken },
      body: JSON.stringify({ content: message, message_type: "outgoing", private: false }),
    });

    if (!resp.ok) {
      console.error("[Chat-Local] Notificação falhou:", resp.status, await resp.text());
    } else {
      console.log("[Chat-Local] Notificação enviada com sucesso para conversa", targetConvId);
    }
  } catch (e) {
    console.warn("[Chat-Local] Erro ao enviar notificação:", e);
  }
}

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
    telefone_cliente?: string;
    veiculo_interesse?: string;
  };
  const isCreated = res.action === "created" && res.event;
  const isCancelled = res.action === "cancelled" && res.deleted_event;
  if (!isCreated && !isCancelled) return;

  const evt = isCreated ? res.event! : res.deleted_event!;
  const title = evt.title || "Agendamento";
  const startAt = evt.start_at || "";
  // #region agent log
  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ad5eb6'},body:JSON.stringify({sessionId:'ad5eb6',location:'chat-local.ts:sendAgendaNotification',message:'start_at do evento antes de formatDateBR',data:{isCreated,isCancelled,startAt,startAtLength:startAt.length,hasOffset:!!startAt.match(/[+-]\d{2}:?\d{2}$/),hasZ:startAt.endsWith('Z')},timestamp:Date.now(),hypothesisId:'H_TIMEZONE'})}).catch(()=>{});
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
      } catch (e) {
        console.warn("[Chat-Local] Erro ao agendar lembrete:", (e as Error)?.message);
      }
    }
  }

  await sendNotificationToGroup(agentId, agent, message);
}

/**
 * Dispara notificação de handoff (cliente aguardando atendimento) quando o assistente usa HANDOFF_COMERCIAL.
 * Mesmo padrão do agendamento: nome, telefone, veículo de interesse.
 */
async function sendHandoffNotification(
  agentId: string,
  agent: { config?: Record<string, unknown>; tenant_id?: string },
  messages: Array<{ role: string; content: string }>,
  externalUserId?: string | null
): Promise<void> {
  const nomeCliente = extractClientNameFromMessages(messages);
  const message = buildHandoffNotification(
    nomeCliente || "Cliente",
    externalUserId?.trim() || undefined,
    undefined,
    messages
  );
  await sendNotificationToGroup(agentId, agent, message);
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

/**
 * Enriquece a descrição de uma tool chatwoot_assign com instruções de roteamento
 * baseadas no execution_config (regras com labels ou assignee/team padrão).
 * Exportada para teste unitário.
 */
export function enrichChatwootAssignDescription(tool: ToolDef, originalDescription: string): string {
  if (tool.tool_type !== "chatwoot_assign") return originalDescription;

  const execCfg = (tool.execution_config || {}) as Record<string, unknown>;
  const rules = Array.isArray(execCfg.rules) ? execCfg.rules as Array<{ label?: string; assignee_id?: number; team_id?: number }> : [];
  const hasLabels = rules.some((r) => r.label);
  const hasDefaultAssignee = execCfg.assignee_id != null;
  const hasDefaultTeam = execCfg.team_id != null;

  const base = originalDescription.trim();

  if (!hasLabels) {
    // Sem labels: execução sem argumentos (execution_config cuida do roteamento)
    const noArgsNote = `IMPORTANTE: chame sem argumentos — NÃO envie assignee_id nem team_id. O execution_config já define o destino.`;
    return base ? `${base}\n${noArgsNote}` : noArgsNote;
  }

  // Com labels: instrui enviar reason para fuzzy matching
  const labelList = rules.filter((r) => r.label).map((r) => `"${r.label}"`).join(", ");
  const hasDefault = hasDefaultAssignee || hasDefaultTeam;

  const firstLabel = rules.find((r) => r.label)?.label ?? "nome da unidade";
  const routing = [
    `Sempre envie reason descrevendo a unidade/destino. Opções disponíveis: ${labelList}.`,
    `NÃO envie assignee_id nem team_id — use apenas reason com o nome da unidade (ex.: reason: "${firstLabel}").`,
    hasDefault ? `Se nenhuma opção casar, o sistema usa o destino padrão (escalacao geral).` : null,
  ].filter(Boolean).join(" ");

  return base ? `${base}\n${routing}` : routing;
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
          description: (fd.description as string) || "",
          parameters: normalizeParametersSchema(fd.parameters),
        },
      };
    });
  return { openaiTools, nameToTool };
}

/** Evita duas chamadas idênticas à mesma galeria no mesmo turno (dispatcher às vezes duplica). */
function dedupeParallelSuiteGalleryToolCalls(
  toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
  nameToTool: Map<string, ToolDef>
): Array<{ id: string; function: { name: string; arguments: string } }> {
  const seen = new Set<string>();
  const out: typeof toolCalls = [];
  for (const tc of toolCalls) {
    const def = nameToTool.get(tc.function.name);
    if (def?.tool_type !== "suite_gallery_query") {
      out.push(tc);
      continue;
    }
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    const s = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
    const nome = s(args.nome) || s(args.nome_galeria) || s(args.nomeGaleria);
    const tema = s(args.tema) || s(args.contexto) || s(args.topico);
    const key = `${tc.function.name}::${nome}|${tema}|${s(args.query)}|${s(args.q)}`;
    if (seen.has(key)) {
      console.warn("[Chat-Local] suite_gallery_query duplicada no mesmo turno — ignorando:", key);
      continue;
    }
    seen.add(key);
    out.push(tc);
  }
  return out;
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
          skip_history_persist?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { agent_id, messages, conversation_id, chatwoot_conversation_id, external_user_id, skip_history_persist } = req.body;

      const skipHistoryExplicit =
        skip_history_persist === true ||
        String(skip_history_persist ?? "").toLowerCase() === "true";

      if (!agent_id || !messages || !Array.isArray(messages)) {
        return reply.status(400).send({ error: "agent_id and messages required" });
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
        .select("slug, settings, db_name")
        .eq("id", agent.tenant_id)
        .single();

      const tenantSlug = tenant?.slug ?? null;
      const tenantSchema = tenant?.db_name ?? null;
      const tenantId = agent.tenant_id as string;
      const tenantSettings = (tenant?.settings || {}) as Record<string, unknown>;
      const agentConfig = (agent.config || {}) as Record<string, unknown>;
      const rawDispatcherId = agentConfig.dispatcher_provider_id ?? tenantSettings.dispatcher_provider_id;
      const dispatcherProviderId = typeof rawDispatcherId === "string" && rawDispatcherId.length > 0 ? rawDispatcherId : null;

      const { data: toolsData } = await supabase.rpc("load_agent_tools", {
        p_agent_id: agent_id,
      });
      const tools = (toolsData || []) as ToolDef[];
      const hasInventoryTool = tools.some((t) => t.tool_type === "inventory_query");

      const systemPrompt = buildSystemPrompt(
        agent.system_prompt || "", // ignorado quando o tenant tem entrada em TENANT_PROMPTS (prompt vem só do projeto)
        tenantSlug,
        hasInventoryTool
      );

      const providerConfig = await getProviderApiKey(agent.provider_id, supabase);
      if (!providerConfig) {
        return reply.status(501).send({
          error: "No LLM provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY, or configure provider with API key.",
        });
      }
      console.log("[Chat-Local] Provider config:", {
        hasApiKey: !!providerConfig.apiKey,
        apiKeyLength: providerConfig.apiKey?.length,
        baseUrl: providerConfig.baseUrl,
        providerId: agent.provider_id,
      });

      let model = agent.model || "gpt-4o-mini";
      const { openaiTools, nameToTool } = buildOpenAITools(tools, providerConfig.baseUrl);
      const useTools = openaiTools.length > 0;
      const isGeminiProvider = /generativelanguage|googleapis\.com\/v1beta/i.test(providerConfig.baseUrl);

      // Gemini 3 e 2.5 (thinking) exigem thought_signature em function calls - não suportado.
      // Fallback apenas em single-provider (quando Gemini recebe tools). Em dual-provider, Gemini conversacional não usa tools.
      if (useTools && !dispatcherProviderId && isGeminiProvider && /^gemini-(3|2\.5)-/i.test(model)) {
        const fallback = "gemini-2.0-flash";
        console.log(`[Chat-Local] Single-provider: modelo ${model} exige thought_signature com tools; usando ${fallback}`);
        model = fallback;
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

      if (useTools) {
        console.log("[Chat-Local] Tools enviadas ao LLM:", JSON.stringify(openaiTools.map((t) => ({
          name: t.function.name,
          desc: t.function.description?.slice(0, 50),
        })), null, 2));
      }

      const shouldPersistHistory = !skipHistoryExplicit;
      let resolvedTenantSchema = tenantSchema;
      let responseConvId = conversation_id ?? null;
      let lastPersistedMessage: { role?: string; content?: string } | null = null;

      async function ensureConversationId(): Promise<void> {
        if (responseConvId || !shouldPersistHistory) return;
        try {
          // Se tenant não tem schema, tenta provisionar automaticamente
          if (!resolvedTenantSchema) {
            console.log("[Chat-Local] Tenant sem db_name, tentando provisionar:", tenantId);
            const { error: provErr } = await supabase.rpc("provision_tenant_schema", {
              p_tenant_id: tenantId,
            });
            if (provErr) {
              console.warn("[Chat-Local] provision_tenant_schema falhou:", provErr.message, "code:", provErr.code);
              return;
            }
            // Recarrega db_name após provisionamento
            const { data: refreshedTenant } = await supabase
              .from("tenants")
              .select("db_name")
              .eq("id", tenantId)
              .single();
            resolvedTenantSchema = refreshedTenant?.db_name ?? null;
            if (!resolvedTenantSchema) {
              console.warn("[Chat-Local] db_name ainda null após provisionamento");
              return;
            }
            console.log("[Chat-Local] Tenant provisionado com schema:", resolvedTenantSchema);
          }
          /** Passa todos os parâmetros para evitar ambiguidade PGRST203 entre as duas assinaturas */
          const { data: createdConvId, error: createErr } = await supabase.rpc("create_conversation", {
            p_agent_id: agent_id,
            p_channel: "sandbox",
            p_external_user_id: external_user_id ?? null,
            p_contact_name: null,
            p_contact_avatar_url: null,
          });
          if (!createErr && createdConvId) {
            responseConvId = createdConvId as string;
            console.log("[Chat-Local] Conversa sandbox (RPC):", String(responseConvId).slice(0, 8) + "…");
            return;
          }
          console.warn("[Chat-Local] create_conversation RPC falhou:", createErr?.message, "code:", createErr?.code, "details:", createErr?.details);
        } catch (e) {
          console.warn("[Chat-Local] Falha ao criar conversa:", (e as Error)?.message);
        }
      }

      async function loadLastPersistedMessage(): Promise<void> {
        if (!shouldPersistHistory || !responseConvId) return;
        try {
          const { data: history } = await supabase.rpc("load_conversation_messages", {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
          });
          if (Array.isArray(history) && history.length > 0) {
            const last = history[history.length - 1] as { role?: string; content?: string };
            lastPersistedMessage = {
              role: typeof last.role === "string" ? last.role : undefined,
              content: typeof last.content === "string" ? last.content : undefined,
            };
          }
        } catch (e) {
          console.warn("[Chat-Local] Falha ao carregar último histórico:", (e as Error)?.message);
        }
      }

      async function persistMessage(
        role: "user" | "assistant",
        content: string,
        metadata?: Record<string, unknown>
      ): Promise<void> {
        const cleanContent = (content || "").trim();
        if (!shouldPersistHistory || !responseConvId || !cleanContent) return;
        if (lastPersistedMessage?.role === role && (lastPersistedMessage?.content || "").trim() === cleanContent) {
          return;
        }
        try {
          const payload: Record<string, unknown> = {
            p_agent_id: agent_id,
            p_conversation_id: responseConvId,
            p_role: role,
            p_content: cleanContent,
            p_model: null,
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: null,
          };
          if (metadata) payload.p_metadata = metadata;
          const { error: saveRpcErr } = await supabase.rpc("save_message", payload);
          if (saveRpcErr) {
            console.warn(`[Chat-Local] save_message RPC (${role}):`, saveRpcErr.message, "code:", saveRpcErr.code, "details:", saveRpcErr.details);
            return;
          }
          lastPersistedMessage = { role, content: cleanContent };
          console.log("[Chat-Local] Histórico persistido:", { conversation_id: responseConvId, role, len: cleanContent.length });
        } catch (e) {
          console.warn(`[Chat-Local] Falha ao persistir mensagem (${role}):`, (e as Error)?.message);
        }
      }

      await ensureConversationId();
      await loadLastPersistedMessage();
      if (shouldPersistHistory && !responseConvId) {
        console.warn("[Chat-Local] Sem conversation_id — histórico do sandbox não será gravado (RPC/fallback falharam?)");
      }
      const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      await persistMessage("user", latestUserMessage);

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

      const isFirstAssistantTurn = messages.filter((m) => m.role === "assistant").length === 0;
      let welcomeImagePrefix = "";
      if (isFirstAssistantTurn && tenantId) {
        welcomeImagePrefix = await getWelcomeConversationImageMarkdown(supabase, tenantId);
      }
      let welcomeImageEmitted = !welcomeImagePrefix;
      const emitWelcomeImagePrefix = () => {
        if (welcomeImageEmitted || !welcomeImagePrefix) return;
        welcomeImageEmitted = true;
        sendSse({ choices: [{ delta: { content: welcomeImagePrefix } }] });
      };
      const prependWelcomeToAssistantText = (text: string): string => {
        if (!welcomeImagePrefix || !isFirstAssistantTurn) return text;
        if (text.startsWith(welcomeImagePrefix)) return text;
        return welcomeImagePrefix + text;
      };
      const emitRepairedAssistant = (text: string) => {
        const trimmed = (text || "").trim();
        if (!trimmed) return;
        sendSse({ repaired_assistant: trimmed });
      };
      const applySuiteGalleryRepairs = (
        assistantText: string,
        toolResultStrings: string[],
        lastUserMessage: string
      ): string => {
        let text = assistantText;
        const galleryInject = injectSuiteGalleryMarkdownIfMissing({
          assistantText: text,
          toolResultStrings,
          lastUserMessage,
        });
        if (galleryInject) {
          console.log("[Chat-Local] Injetando photos_markdown suite_gallery (omissão do modelo)");
          text = galleryInject.fullText;
        }
        const videoInject = injectSuiteGalleryVideosIfMissing({
          assistantText: text,
          toolResultStrings,
          lastUserMessage,
        });
        if (videoInject) {
          console.log("[Chat-Local] Injetando vídeo suite_gallery (omissão do modelo)");
          text = videoInject.fullText;
        }
        const omnibeesPhotoInject = injectOmnibeesQuotePhotosIfMissing(text, toolResultStrings);
        if (omnibeesPhotoInject) {
          console.log("[Chat-Local] Injetando fotos cover Omnibees no orçamento (omissão do modelo)");
          text = omnibeesPhotoInject.fullText;
        }
        return text;
      };

      // Dual-provider: OpenAI para tools (dispatcher), Gemini para conversacional
      if (useTools && dispatcherProviderId) {
        const dispatcherConfig = await getProviderApiKey(dispatcherProviderId, supabase);
        if (dispatcherConfig) {
          console.log("[Chat-Local] Dual-provider: dispatcher (tools) + conversacional");
          const { openaiTools: dispatcherTools, nameToTool: dispatcherNameToTool } = buildOpenAITools(tools, dispatcherConfig.baseUrl);
          let dispatcherModel = (agentConfig.dispatcher_model as string)
            || (tenantSettings.dispatcher_model as string)
            || "gpt-4o";
          if (dispatcherModel === "gpt-4o-mini") {
            dispatcherModel = "gpt-4o";
            console.log("[Chat-Local] Dispatcher upgrade: gpt-4o-mini -> gpt-4o (maior inteligência para tool calls)");
          }
          console.log("[Chat-Local] Dispatcher model:", dispatcherModel);

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

          const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          let schedulingHint = "";
          if (lastAssistantMsg && lastUserMsg) {
            const offeredTimes = /\b\d{1,2}[h:]\d{0,2}\b/.test(lastAssistantMsg.content);
            const offeredTomorrow = /amanh[aã]|dia seguinte|depois de amanhã/i.test(lastAssistantMsg.content);
            const userChoseTime = /\b\d{1,2}[h:]\d{0,2}\b/.test(lastUserMsg.content) ||
              /(pode ser|quero|prefiro|vou|marco|as\s+\d|amanh[aã]\s*(as)?\s*\d)/i.test(lastUserMsg.content);
            if (offeredTimes && userChoseTime) {
              schedulingHint = `\n\n[HINT OBRIGATÓRIO] O assistente ofereceu horários e o cliente ESCOLHEU um. Você DEVE chamar consultar_agenda com action="criar". NÃO use "cancelar" nem "check_availability".`;
              if (offeredTomorrow) {
                schedulingHint += ` Use a data de AMANHÃ em start_at: ${tomorrowISO}T[HORA]:00:00-03:00 (ex.: ${tomorrowISO}T11:00:00-03:00), NÃO use ${todayISO}.`;
              }
            }
          }

          // Entity extraction: detect marca/modelo/ano/km from last user message to help the dispatcher
          const entities = lastUserMsg ? extractVehicleEntities(lastUserMsg.content) : {};
          const appraisalCtx = isAppraisalContext(messages);
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

          const dispatcherMessages = toOpenAIMessages(
            getDispatcherPrompt(tenantSlug) + dispatcherDateContext + entityHint + schedulingHint,
            messages
          );

          const dispatcherBody: Record<string, unknown> = {
            model: dispatcherModel,
            messages: dispatcherMessages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0.2,
            tools: dispatcherTools,
            tool_choice: "auto",
          };

          const base = dispatcherConfig.baseUrl.replace(/\/+$/, "");
          const isGeminiBase = /generativelanguage\.googleapis\.com/i.test(base);
          const dispatcherApiUrl = isGeminiBase && !base.includes("/openai")
            ? `${base}/openai/chat/completions`
            : `${base}/chat/completions`;

          console.log("[Chat-Local] Dispatcher request:", {
            url: dispatcherApiUrl,
            model: dispatcherBody.model,
            hasAuth: !!dispatcherConfig.apiKey,
            authLength: dispatcherConfig.apiKey?.length,
          });

          let dispatcherResp: Response;
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

          if (!dispatcherResp.ok) {
            const errText = await dispatcherResp.text();
            console.error("[Chat-Local] Dispatcher error:", dispatcherResp.status, errText.slice(0, 200));
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

          const phase1ToolCallsRaw = Object.values(toolCallsAccum)
            .filter((tc) => tc.name)
            .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }));
          const phase1ToolCalls = dedupeParallelSuiteGalleryToolCalls(phase1ToolCallsRaw, dispatcherNameToTool);

          if (phase1ToolCalls.length > 0) {
            console.log("[Chat-Local] Dispatcher decidiu chamar tools:", phase1ToolCalls.map((tc) => ({
              tool: tc.function.name,
              args: tc.function.arguments,
            })));
          }

          let conversationalMessages: typeof dispatcherMessages;

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
            conversationalMessages = toOpenAIMessages(systemPrompt, messages);
            conversationalMessages.push(assistantMsg);

            const debugEntries: Array<{ type: string; tool?: string; args?: Record<string, unknown>; tool_type?: string; preview?: unknown; [k: string]: unknown }> = [
              { type: "dispatcher_tool_calls", tool_names: phase1ToolCalls.map((tc) => tc.function.name), tool_calls_count: phase1ToolCalls.length },
            ];

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

                // Garantir que args seja sempre um objeto (JSON.parse pode retornar primitivo)
                if (typeof args !== "object" || args === null || Array.isArray(args)) {
                  console.warn("[Chat-Local] args não é objeto, resetando para {}. Valor original:", JSON.stringify(args));
                  args = {};
                }

                const isEstoqueEmpty = tc.function.name === "consultar_estoque" && Object.keys(args).length === 0;
                if (isEstoqueEmpty) {
                  const recentText = messages
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

                if (isNearestUnitTool(tc.function.name) && !args.cep) {
                  const fallbackCep = extractCepFromMessages(messages);
                  if (fallbackCep) {
                    args = { ...args, cep: fallbackCep };
                    console.log("[Chat-Local] consultar_unidade sem cep: fallback extraiu do histórico:", fallbackCep);
                  } else {
                    console.warn("[Chat-Local] consultar_unidade BLOQUEADO: cep ausente e não encontrado no histórico.");
                    debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                    debugEntries.push({ type: "tool_result", preview: { error: "consultar_unidade rejeitada — cep ausente" } });
                    conversationalMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ error: "consultar_unidade chamada sem o argumento cep. Peça o CEP (8 dígitos) ao cliente antes de chamar esta ferramenta." }),
                    });
                    continue;
                  }
                }

                if (isOmnibeesTool(tc.function.name)) {
                  const validation = validateOmnibeesArgs(args, messages);
                  if (!validation.ok) {
                    console.warn("[Chat-Local] Omnibees BLOQUEADO (dual):", validation.error);
                    debugEntries.push({ type: "tool_call", tool: tc.function.name, args, tool_type: "function" });
                    debugEntries.push({ type: "tool_result", preview: { error: validation.error } });
                    conversationalMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ error: validation.error }),
                    });
                    continue;
                  }
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
                  content: buildOmnibeesGuardedContent(tc.function.name, result),
                });
                if (tc.function.name === "consultar_agenda" && result.success && result.result) {
                  sendAgendaNotification(agent_id, agent, result.result, messages, external_user_id, responseConvId, chatwoot_conversation_id).catch(() => {});
                }
              }
            }
            sendSse({ debug: debugEntries });
          } else {
            conversationalMessages = toOpenAIMessages(systemPrompt, messages);
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
              content: `Resultados obtidos:\n${naturalToolResultsText}\n\nCom base nesses resultados, responda ao cliente de forma natural e objetiva. NÃO inclua JSON, nomes de ferramentas ou artefatos técnicos.`,
            });
          }
          // #region agent log
          fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:929',message:'Mensagens para conversacional (Gemini)',data:{messagesCount:conversationalMessagesClean.length,toolResultsCount:toolResults.length,naturalToolResultsTextPreview:naturalToolResultsText.slice(0,300),lastMessage:conversationalMessagesClean[conversationalMessagesClean.length-1]},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
          // #endregion

          const convModel = model;
          const convBody: Record<string, unknown> = {
            model: convModel,
            messages: conversationalMessagesClean,
            stream: true,
            stream_options: { include_usage: true },
            temperature: agent.temperature ?? 0.7,
          };

          const convBase = providerConfig.baseUrl.replace(/\/+$/, "");
          const convIsGemini = /generativelanguage\.googleapis\.com/i.test(convBase);
          const convApiUrl = convIsGemini && !convBase.includes("/openai")
            ? `${convBase}/openai/chat/completions`
            : `${convBase}/chat/completions`;

          console.log("[Chat-Local] Conversational request:", {
            url: convApiUrl,
            model: convBody.model,
            hasAuth: !!providerConfig.apiKey,
            authLength: providerConfig.apiKey?.length,
            messagesCount: conversationalMessagesClean.length,
            hasToolResults: toolResults.length > 0,
          });
          if (toolResults.length > 0) {
            console.log("[Chat-Local] Tool results sendo enviados ao LLM conversacional:", toolResults.length, "results");
          }

          let convResp!: Response;
          let convBodyAttempt: Record<string, unknown> = { ...convBody };
          const convMaxAttempts = convIsGemini ? 3 : 1;
          try {
            let lastErrText = "";
            let lastStatus = 0;
            for (let convAttempt = 0; convAttempt < convMaxAttempts; convAttempt++) {
              if (convAttempt > 0) {
                const delayMs = 700 * convAttempt;
                console.warn(
                  `[Chat-Local] Conversational retry ${convAttempt + 1}/${convMaxAttempts} após ${lastStatus} (aguardando ${delayMs}ms)`
                );
                await new Promise((r) => setTimeout(r, delayMs));
                if (
                  convIsGemini &&
                  convAttempt >= 1 &&
                  typeof convBodyAttempt.model === "string" &&
                  !/^gemini-2\.0-flash/i.test(convBodyAttempt.model)
                ) {
                  convBodyAttempt = { ...convBodyAttempt, model: GEMINI_CONVERSATIONAL_FALLBACK_MODEL };
                  console.warn(
                    "[Chat-Local] Conversational usando modelo fallback:",
                    GEMINI_CONVERSATIONAL_FALLBACK_MODEL
                  );
                }
              }
              convResp = await fetch(convApiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${providerConfig.apiKey}`,
                },
                body: JSON.stringify(convBodyAttempt),
                signal: AbortSignal.timeout(60000),
              });
              if (convResp.ok) {
                break;
              }
              lastErrText = await convResp.text();
              lastStatus = convResp.status;
              console.error(
                "[Chat-Local] Conversational LLM error:",
                convResp.status,
                lastErrText.slice(0, 200)
              );
              const retryable =
                convIsGemini &&
                (convResp.status === 503 || convResp.status === 429) &&
                convAttempt < convMaxAttempts - 1;
              if (!retryable) {
                sendSse({ error: providerErrorMessage(convResp.status, lastErrText) });
                sendSse("[DONE]");
                reply.raw.end();
                return;
              }
            }
          } catch (fetchErr: unknown) {
            const e = fetchErr as { code?: string; message?: string };
            const isNetworkError = e?.code === "ECONNRESET" || /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(String(e?.message || ""));
            console.error("[Chat-Local] Conversational fetch failed:", e?.message || fetchErr);
            sendSse({ error: isNetworkError ? "Conexão com LLM interrompida. Tente novamente." : (e?.message || "Falha ao conectar com LLM conversacional") });
            sendSse("[DONE]");
            reply.raw.end();
            return;
          }
          console.log("[Chat-Local] Conversational LLM response OK, iniciando streaming...");

          let debugDeltaCount = 0;
          let debugDeltaTotalLen = 0;
          let debugSendCount = 0;
          let debugSendTotalLen = 0;

          emitWelcomeImagePrefix();
          const convReader = convResp.body!.getReader();
          const convDecoder = new TextDecoder();
          let convBuf = "";
          let streamFilterBuffer = "";
          let convFullContent = welcomeImagePrefix;
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
                      debugSendCount++;
                      debugSendTotalLen += toSend.length;
                      console.log("[Chat-Local] Streaming content chunk:", toSend.slice(0, 50));
                      sendSse({ choices: [{ delta: { content: toSend } }] });
                    }
                  }
                } catch { /* skip */ }
              }
            }
            if (done) {
              // convFullContent já inclui todos os delta.content; não somar streamFilterBuffer (duplicava o sufixo).
              if (streamFilterBuffer) {
                debugSendCount++;
                debugSendTotalLen += streamFilterBuffer.length;
                sendSse({ choices: [{ delta: { content: streamFilterBuffer } }] });
              }
              // Primeiro contato: pergunta do nome só se NÃO tiver vídeo de boas-vindas E o modelo ainda não perguntou o nome
              const isFirstContact = messages.filter((m) => m.role === "assistant").length === 0;
              const agentCfg = (agent?.config || {}) as Record<string, unknown>;
              const hasWelcomeVideo = !!(agentCfg.welcome_video_url as string)?.trim();
              const nameQuestion = (agentCfg.welcome_name_question as string) || "Como posso te chamar?";
              const modelAlreadyAskedName = /como\s+(prefere\s+ser\s+chamad|posso\s+te\s+chamar|posso\s+chamar|gostaria\s+de\s+ser\s+chamad)|com\s+quem\s+(eu\s+)?tenho\s+o\s+prazer|com\s+quem\s+(eu\s+)?falo|qual\s+(é\s+)?(seu|o)\s+nome|como\s+você\s+prefere\s+ser\s+chamad/i.test(convFullContent);
              if (isFirstContact && nameQuestion && !hasWelcomeVideo && !modelAlreadyAskedName) {
                const nqContent = "\n\n" + nameQuestion;
                debugSendCount++;
                debugSendTotalLen += nqContent.length;
                sendSse({ choices: [{ delta: { content: nqContent } }] });
              }
              break;
            }
          }

          const lastUserForGalleryInject = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
          convFullContent = applySuiteGalleryRepairs(convFullContent, toolResults, lastUserForGalleryInject);

          if (/HANDOFF_COMERCIAL/i.test(convFullContent)) {
            sendHandoffNotification(agent_id, agent, messages, external_user_id).catch((e) => {
              console.warn("[Chat-Local] Erro ao enviar notificação de handoff:", (e as Error)?.message);
            });
            if (responseConvId) {
              supabase.rpc("cancel_pending_followups", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
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
          emitMediaCommandsSseIfNeeded(sendSse, convFullContent);

          if (debugSendTotalLen === 0) {
            console.warn("[Chat-Local] Resposta vazia do conversacional", {
              debugDeltaCount,
              debugDeltaTotalLen,
              debugSendCount,
              hint: debugDeltaTotalLen > 0 && debugSendTotalLen === 0 ? "conteúdo filtrado por filterCommandLines" : "modelo retornou vazio ou sem deltas",
            });
            // #region agent log
            fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1053',message:'Resposta vazia - iniciando retry',data:{debugDeltaCount,debugDeltaTotalLen,debugSendCount,streamFilterBufferFinal:streamFilterBuffer},timestamp:Date.now(),hypothesisId:'H1,H2,H4'})}).catch(()=>{});
            // #endregion
            try {
              const retryMessages = conversationalMessagesClean.slice(0, 1).concat(
                conversationalMessagesClean.filter((m) => m.role === "user" || m.role === "assistant").slice(-4)
              );
              if (toolResults.length > 0 && naturalToolResultsText) {
                retryMessages.push({ role: "user", content: `Resultados obtidos:\n${naturalToolResultsText}\n\nCom base nesses resultados, responda ao cliente de forma natural e objetiva. NÃO inclua JSON, nomes de ferramentas ou artefatos técnicos.` });
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
                // #region agent log
                fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1077',message:'Retry response recebido',data:{retryContent:retryContent,retryContentLen:retryContent?.length||0},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
                // #endregion
                if (retryContent) {
                  const sanitized = sanitizeLLMOutput(retryContent);
                  // #region agent log
                  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1081',message:'Após sanitizeLLMOutput',data:{sanitized:sanitized,sanitizedLen:sanitized.length,wasStripped:retryContent.length>0&&sanitized.length===0},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
                  // #endregion
                  if (sanitized) {
                    console.log("[Chat-Local] Retry OK, enviando conteúdo sanitizado:", sanitized.slice(0, 80));
                    sendSse({ choices: [{ delta: { content: sanitized } }] });
                  } else {
                    const fallback = fallbackSanitizeForRetry(retryContent);
                    // #region agent log
                    fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1089',message:'Fallback sanitize',data:{fallback:fallback,fallbackLen:fallback.length,retryContentPreview:retryContent.slice(0,300)},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
                    // #endregion
                    if (fallback) {
                      console.log("[Chat-Local] sanitize retornou vazio, usando fallback:", fallback.slice(0, 80));
                      sendSse({ choices: [{ delta: { content: fallback } }] });
                    } else {
                      console.warn("[Chat-Local] sanitize retornou vazio, retryContent preview:", retryContent.slice(0, 200));
                      sendSse({ choices: [{ delta: { content: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?" } }] });
                    }
                  }
                } else {
                  // #region agent log
                  fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1102',message:'Retry retornou vazio',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
                  // #endregion
                  console.warn("[Chat-Local] Retry também retornou vazio, enviando mensagem neutra");
                  sendSse({ choices: [{ delta: { content: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?" } }] });
                }
              } else {
                const errText = await retryResp.text();
                // #region agent log
                fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9697c3'},body:JSON.stringify({sessionId:'9697c3',location:'chat-local.ts:1111',message:'Retry HTTP falhou',data:{status:retryResp.status,errText:errText.slice(0,200)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
                // #endregion
                console.warn("[Chat-Local] Retry falhou:", retryResp.status, errText.slice(0, 150));
                sendSse({ choices: [{ delta: { content: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?" } }] });
              }
            } catch (retryErr) {
              console.error("[Chat-Local] Retry error:", retryErr);
              sendSse({ choices: [{ delta: { content: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?" } }] });
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

          const rawConvAssist = prependWelcomeToAssistantText((convFullContent || "").trim());
          emitRepairedAssistant(rawConvAssist);
          const assistantForHistory = sanitizeLLMOutput(rawConvAssist) || rawConvAssist;
          const assistantMetadata = tokenUsagePayload.dispatcher || tokenUsagePayload.conversational
            ? { token_usage: tokenUsagePayload }
            : undefined;
          await persistMessage("assistant", assistantForHistory, assistantMetadata);
          sendSse({ conversation_id: responseConvId });
          sendSse("[DONE]");
          reply.raw.end();
          return;
        }
      }

      let llmMessages = toOpenAIMessages(systemPrompt, messages);
      let fullContent = "";
      let iteration = 0;
      let singleProviderUsageAccum = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      while (iteration < MAX_TOOL_ITERATIONS) {
        iteration++;

        const body: Record<string, unknown> = {
          model,
          messages: llmMessages,
          stream: true,
          stream_options: { include_usage: true },
          temperature: agent.temperature ?? 0.7,
        };

        if (useTools && iteration === 1) {
          body.tools = openaiTools;
          body.tool_choice = "auto";
        }

        // Gemini: endpoint OpenAI-compatible é /openai/chat/completions
        const base = providerConfig.baseUrl.replace(/\/+$/, "");
        const isGeminiBase = /generativelanguage\.googleapis\.com/i.test(base);
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
                  if (toSend) {
                    emitWelcomeImagePrefix();
                    sendSse({ choices: [{ delta: { content: toSend } }] });
                  }
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
            if (streamFilterBuffer) {
              emitWelcomeImagePrefix();
              sendSse({ choices: [{ delta: { content: streamFilterBuffer } }] });
            }
            const isFirstContact = messages.filter((m) => m.role === "assistant").length === 0;
            const agentCfgSingle = (agent?.config || {}) as Record<string, unknown>;
            const hasWelcomeVideoSingle = !!(agentCfgSingle.welcome_video_url as string)?.trim();
            const nameQuestionSingle = (agentCfgSingle.welcome_name_question as string) || "Como posso te chamar?";
            const modelAlreadyAskedNameSingle = /como\s+(prefere\s+ser\s+chamad|posso\s+te\s+chamar|posso\s+chamar|gostaria\s+de\s+ser\s+chamad)|com\s+quem\s+(eu\s+)?tenho\s+o\s+prazer|com\s+quem\s+(eu\s+)?falo|qual\s+(é\s+)?(seu|o)\s+nome|como\s+você\s+prefere\s+ser\s+chamad/i.test(content);
            if (isFirstContact && nameQuestionSingle && !hasWelcomeVideoSingle && !modelAlreadyAskedNameSingle) {
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
            sendHandoffNotification(agent_id, agent, messages, external_user_id).catch((e) => {
              console.warn("[Chat-Local] Erro ao enviar notificação de handoff (single-provider):", (e as Error)?.message);
            });
            if (responseConvId) {
              supabase.rpc("cancel_pending_followups", {
                p_agent_id: agent_id,
                p_conversation_id: responseConvId,
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
          const lastUserForGalleryInjectSP = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
          const toolStringsSP: string[] = [];
          for (const m of llmMessages) {
            const role = (m as { role?: string }).role;
            const c = (m as { content?: unknown }).content;
            if (role === "tool" && typeof c === "string") toolStringsSP.push(c);
          }
          fullContent = applySuiteGalleryRepairs(fullContent, toolStringsSP, lastUserForGalleryInjectSP);
          emitMediaCommandsSseIfNeeded(sendSse, fullContent);
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
          const rawSingleAssist = prependWelcomeToAssistantText((fullContent || "").trim());
          emitRepairedAssistant(rawSingleAssist);
          const assistantForHistory = sanitizeLLMOutput(rawSingleAssist) || rawSingleAssist;
          const assistantMetadata =
            singleProviderUsageAccum.total_tokens > 0
              ? { token_usage: { single: { ...singleProviderUsageAccum, model } } }
              : undefined;
          await persistMessage("assistant", assistantForHistory, assistantMetadata);
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

          // Garantir que args seja sempre um objeto (JSON.parse pode retornar primitivo)
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            console.warn("[Chat-Local] args não é objeto (single-provider), resetando para {}. Valor original:", JSON.stringify(args));
            args = {};
          }

          const isEstoqueEmptySP = tc.function.name === "consultar_estoque" && Object.keys(args).length === 0;
          if (isEstoqueEmptySP) {
            const recentTextSP = messages
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

          if (isNearestUnitTool(tc.function.name) && !args.cep) {
            const fallbackCepSP = extractCepFromMessages(messages);
            if (fallbackCepSP) {
              args = { ...args, cep: fallbackCepSP };
              console.log("[Chat-Local] consultar_unidade sem cep (single-provider): fallback extraiu do histórico:", fallbackCepSP);
            } else {
              console.warn("[Chat-Local] consultar_unidade BLOQUEADO (single-provider): cep ausente e não encontrado no histórico.");
              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: "consultar_unidade chamada sem o argumento cep. Peça o CEP (8 dígitos) ao cliente antes de chamar esta ferramenta." }),
              });
              continue;
            }
          }

          if (isOmnibeesTool(tc.function.name)) {
            const validation = validateOmnibeesArgs(args, messages);
            if (!validation.ok) {
              console.warn("[Chat-Local] Omnibees BLOQUEADO (single):", validation.error);
              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: validation.error }),
              });
              continue;
            }
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
            content: buildOmnibeesGuardedContent(tc.function.name, result),
          });
          if (tc.function.name === "consultar_agenda" && result.success && result.result) {
            sendAgendaNotification(agent_id, agent, result.result, messages, external_user_id, responseConvId, chatwoot_conversation_id).catch(() => {});
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
      {
        const lastUserGI = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const toolStrsLoop: string[] = [];
        for (const m of llmMessages) {
          const role = (m as { role?: string }).role;
          const c = (m as { content?: unknown }).content;
          if (role === "tool" && typeof c === "string") toolStrsLoop.push(c);
        }
        let finalAssistantRaw = applySuiteGalleryRepairs(fullContent, toolStrsLoop, lastUserGI);
        emitMediaCommandsSseIfNeeded(sendSse, finalAssistantRaw);
        const rawLoopAssist = prependWelcomeToAssistantText((finalAssistantRaw || "").trim());
        emitRepairedAssistant(rawLoopAssist);
        const assistantForHistory = sanitizeLLMOutput(rawLoopAssist) || rawLoopAssist;
        const assistantMetadata =
          singleProviderUsageAccum.total_tokens > 0
            ? { token_usage: { single: { ...singleProviderUsageAccum, model } } }
            : undefined;
        await persistMessage("assistant", assistantForHistory, assistantMetadata);
      }
      sendSse({ conversation_id: responseConvId });
      sendSse("[DONE]");
      reply.raw.end();
    }
  );
}

/** Exportados para testes (guardas Omnibees). */
export { validateOmnibeesArgs, userProvidedChildrenStatus };
