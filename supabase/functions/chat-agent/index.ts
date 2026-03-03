import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildSystemPrompt, getDispatcherPrompt } from "../_shared/prompts/registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- crypto helpers ----------
async function getKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ---------- sanitize LLM output ----------
// Remove tool-call artifacts that LLMs sometimes leak into content
function sanitizeLLMOutput(content: string): string {
  let text = content;
  // Remove lines like "ENVIAR_FOTOS_VEICULO: ...", "ENVIAR_FOTO: ...", etc.
  text = text.replace(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/gmi, "");
  // Remove HANDOFF_COMERCIAL command lines (should not be visible to client)
  text = text.replace(/^.*HANDOFF_COMERCIAL.*$/gmi, "");
  // Remove other common tool artifact patterns
  text = text.replace(/^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/gmi, "");

  // Remove leaked JSON blocks (tool calls, action objects, query objects)
  // Matches standalone JSON-like blocks: { "key": "value" } or { "action": ... }
  text = text.replace(/^\s*\{[\s\S]*?"(action|action_input|modelo|marca|tool|function|query|search|consultar_estoque)"[\s\S]*?\}\s*$/gmi, "");
  // Also catch inline JSON artifacts within paragraphs
  text = text.replace(/\{\s*"(action|action_input|modelo|marca|tool_name|function_name|consultar_estoque)"[^}]*\}/gi, "");

  // Remove "Vou verificar/consultar no sistema" + JSON blocks (LLM thinking out loud)
  text = text.replace(/^.*(?:vou (?:verificar|consultar|checar|buscar)|verificando|consultando|buscando).*(?:sistema|estoque|banco).*[:]\s*$/gmi, "");

  // Clean up excessive newlines left behind
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function dedupeRepeatedParagraphs(content: string): string {
  const parts = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return content;

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\s+/g, " ").trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  return deduped.join("\n\n").trim();
}

function isValidPhotoUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim().replace(/[)}\]]+$/, ""); // Remove trailing brackets/parens
  try {
    const u = new URL(trimmed);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    // Must have a path beyond just "/"
    if (u.pathname.length <= 1) return false;
    // Must look like an image path
    if (!/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function cleanPhotoUrl(url: string): string {
  return url.trim().replace(/[)}\]]+$/, "");
}

function normalizeVehiclePhotos(vehicle: any): string[] {
  let parsedPhotos: string[] = [];

  if (Array.isArray(vehicle?.photos)) {
    parsedPhotos = vehicle.photos.filter((p: unknown) => typeof p === "string") as string[];
  } else if (typeof vehicle?.photos === "string" && vehicle.photos.trim()) {
    // Handle double-escaped JSON: "\"[\\\"url1\\\",\\\"url2\\\"]\"" 
    let raw = vehicle.photos.trim();
    // Unwrap outer quotes if present (double-stringified)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const decoded = JSON.parse(raw);
        if (Array.isArray(decoded)) {
          parsedPhotos = decoded.filter((p: unknown) => typeof p === "string") as string[];
          break;
        } else if (typeof decoded === "string") {
          // Still a string — try parsing again (double/triple encoded)
          raw = decoded;
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  const all = Array.from(new Set([...(vehicle?.photo_url ? [vehicle.photo_url] : []), ...parsedPhotos]));
  return all.map(cleanPhotoUrl).filter(isValidPhotoUrl);
}

function appendMissingVehiclePhotos(content: string, vehicles: any[], userContext: string, forceSpecificRequest = false): string {
  if (!vehicles.length) return content;

  // Determine if user is asking about a SPECIFIC vehicle
  const isSpecificRequest = /\bfotos?\b|\bimagens?\b|\bmostrar?\b|\benviar?\b|\bver\b/.test(userContext);

  if (!forceSpecificRequest && !isSpecificRequest) return content; // General listing — let LLM handle with 1 photo per car

  // CRITICAL: Rank vehicles by overlap with the LLM RESPONSE CONTENT (not user text).
  // The LLM response contains specific details (year, version, price) that identify which vehicle it's discussing.
  // Using the user text caused mismatches when users say generic things like "essa mais nova".
  const normalizedContent = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const scoreVehicle = (v: any) => {
    let score = 0;
    const hay = `${v?.brand || ""} ${v?.model || ""} ${v?.version || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const tokens = hay.split(/\s+/).filter((t: string) => t.length >= 3);
    score += tokens.reduce((acc: number, token: string) => acc + (normalizedContent.includes(token) ? 1 : 0), 0);

    // Bonus: match year, price, color in the LLM response for disambiguation
    if (v?.year && normalizedContent.includes(String(v.year))) score += 3;
    if (v?.price) {
      const priceStr = Number(v.price).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
      if (normalizedContent.includes(priceStr) || normalizedContent.includes(String(v.price))) score += 3;
    }
    if (v?.color) {
      const normColor = String(v.color).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normColor.length >= 3 && normalizedContent.includes(normColor)) score += 2;
    }
    if (v?.version) {
      const normVersion = String(v.version).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const versionTokens = normVersion.split(/\s+/).filter((t: string) => t.length >= 3);
      score += versionTokens.reduce((acc: number, token: string) => acc + (normalizedContent.includes(token) ? 2 : 0), 0);
    }
    return score;
  };

  const ranked = [...vehicles].sort((a, b) => scoreVehicle(b) - scoreVehicle(a));
  const targetVehicle = ranked[0] || vehicles[0];
  console.log(`[appendMissingVehiclePhotos] Ranked vehicles: ${ranked.map((v: any) => `${v.brand} ${v.model} ${v.year} → score=${scoreVehicle(v)}`).join(" | ")}`);

  if (!targetVehicle) return content;

  const allPhotos = normalizeVehiclePhotos(targetVehicle);
  if (!allPhotos.length) return content;

  // Collect URLs already in the LLM response
  const existingUrls = new Set<string>();
  const imageMdRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = imageMdRegex.exec(content)) !== null) {
    if (match[1]) existingUrls.add(match[1]);
  }

  const missing = allPhotos.filter((url) => !existingUrls.has(url));
  if (!missing.length) return content;

  const photosBlock = missing.map((url) => `![foto](${url})`).join("\n");
  return `${content.trim()}\n\n${photosBlock}`.trim();
}

// Split long messages into WhatsApp-friendly chunks
// Separator used in SSE stream so frontend/webhook can render as separate bubbles
const MSG_SPLIT = "<<MSG_SPLIT>>";

function isVehicleMediaOrDetailRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /\bfotos?\b|\bimagens?\b|\bdetalhes?\b|\bmais informacoes?\b|\bver\b|\bmostrar\b|\benviar\b/.test(normalized);
}

function removeRedundantPhotoOfferWhenPhotosPresent(content: string): string {
  if (!hasMarkdownImages(content)) return content;

  const paragraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const filtered = paragraphs.filter((p) => {
    const normalized = p
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return !/(quer|gostaria|posso|pode).*(enviar|mandar|mostrar).*(fotos?|imagens?)/.test(normalized);
  });

  return filtered.join("\n\n").trim() || content;
}

function extractMarkdownPhotoUrls(content: string): string[] {
  const urls: string[] = [];
  const imageMdRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = imageMdRegex.exec(content)) !== null) {
    const raw = match[1] || "";
    const cleaned = cleanPhotoUrl(raw);
    if (isValidPhotoUrl(cleaned)) urls.push(cleaned);
  }
  return Array.from(new Set(urls));
}

function removePreviouslySentPhotoBlocks(content: string, historyMessages: Array<{ role: string; content: string }>): { content: string; removedCount: number } {
  if (!hasMarkdownImages(content)) return { content, removedCount: 0 };

  const previouslySent = new Set<string>();
  for (const msg of historyMessages) {
    if (msg.role !== "assistant" || !msg.content) continue;
    const urls = extractMarkdownPhotoUrls(msg.content);
    for (const url of urls) previouslySent.add(url);
  }

  if (previouslySent.size === 0) return { content, removedCount: 0 };

  let removedCount = 0;
  let next = content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, (full, rawUrl: string) => {
    const cleaned = cleanPhotoUrl(rawUrl || "");
    if (previouslySent.has(cleaned)) {
      removedCount += 1;
      return "";
    }
    return full;
  });

  next = next.replace(/\n{3,}/g, "\n\n").trim();
  return { content: next, removedCount };
}

function buildRecentUserContextText(conversationMessages: any[], maxMessages = 4): string {
  return (conversationMessages || [])
    .filter((m: any) => m?.role === "user" && typeof m?.content === "string")
    .slice(-maxMessages)
    .map((m: any) => String(m.content || "").trim())
    .filter(Boolean)
    .join(" ");
}

function isUserSelectingPreviousOption(text: string): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\b(gosto da|gostei da|prefiro a|prefiro essa|prefiro esta|fico com|vou de|quero a|quero essa|essa mesmo|esta mesmo|a segunda opcao|segunda opcao|a primeira opcao|primeira opcao|a terceira opcao|terceira opcao|opcao 2|opcao 1|opcao 3|numero 2|numero 1|numero 3|a de baixo|a de cima)\b/i.test(normalized);
}

function buildFallbackInventoryArgs(userText: string, conversationMessages?: any[]): Record<string, any> {
  // Try to extract the vehicle model/brand from conversation context first
  // The user might say "gostei do corola, fotos?" — we need to find "COROLLA" from assistant's previous messages
  const extractedFromContext = extractVehicleFromContext(userText, conversationMessages || []);
  if (extractedFromContext) {
    console.log(`Recovery: extracted vehicle from context: ${JSON.stringify(extractedFromContext)}`);
    return extractedFromContext;
  }

  // Fallback: parse user text directly
  const normalized = userText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ");

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);

  const stopWords = new Set([
    "quero", "teria", "tem", "de", "do", "da", "dos", "das", "um", "uma", "uns", "umas",
    "pra", "para", "com", "sem", "mais", "sobre", "esse", "essa", "isso", "fotos", "foto",
    "imagem", "imagens", "detalhe", "detalhes", "informacao", "informacoes", "manda", "envia",
    "enviar", "ver", "me", "dele", "dela", "por", "favor", "boa", "opcao", "e", "o", "a",
    "gostei", "queria", "interessei", "gosto", "legal", "show", "otimo", "bom",
    "que", "qual", "quais", "ai", "aqui", "disponivel", "disponiveis", "disponibilidade", "estoque",
    "carro", "carros", "veiculo", "veiculos", "temos", "tinha",
  ]);

  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || stopWords.has(t) || /^\d+$/.test(t)) return false;
      // Keep normal terms (>=3) and short alphanumeric model codes (q5, x1, c180, a3...)
      if (t.length >= 3) return true;
      return /^[a-z]{1,3}\d{1,4}[a-z0-9-]*$/i.test(t);
    });

  const args: Record<string, any> = {};
  if (yearMatch) args.year = Number(yearMatch[0]);
  if (tokens.length > 0) {
    args.search = tokens.slice(0, 4).join(" ");
  } else {
    const weakSearchPattern = /^(disponivel( no estoque)?|em estoque|no estoque|estoque|disponibilidade|carro|veiculo|tem)$/i;
    const raw = normalized.trim().slice(0, 80);
    if (raw && !weakSearchPattern.test(raw)) args.search = raw;
  }

  return args;
}

// Extract vehicle brand/model from conversation context by matching user's mention against assistant's previous vehicle listings
function extractVehicleFromContext(userText: string, conversationMessages: any[]): Record<string, any> | null {
  const normalizedUser = userText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const knownBrands = [
    "toyota", "honda", "hyundai", "chevrolet", "volkswagen", "fiat", "ford", "jeep",
    "nissan", "renault", "mitsubishi", "kia", "peugeot", "citroen", "bmw", "mercedes",
    "audi", "volvo", "subaru", "suzuki", "ram", "dodge", "caoa", "chery", "byd",
    "gwm", "jac", "lifan", "land rover", "porsche", "mini", "lexus",
  ];

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Detect if user message is just an affirmative or a photo/detail request without specifying a vehicle
  const isAffirmativeOnly = /^(sim|claro|ok|pode|pode sim|pode ser|com certeza|por favor|por gentileza|gentileza|manda|mande|envie|quero|show|bora|vamos|yes|please|ss+|sii+m?)$/i.test(
    normalizedUser
  );
  const isGenericPhotoRequest = /^(tem fotos?|manda fotos?|envia fotos?|pode enviar fotos?|quero ver fotos?|fotos?|ver fotos?|mostra fotos?|imagens?|tem imagens?)[\s?!.]*$/i.test(
    normalizedUser.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
  );

  const stopWords = new Set([
    "sim", "claro", "ok", "pode", "por", "favor", "gentileza", "com", "certeza", "manda", "mande", "envie",
    "quero", "show", "bora", "vamos", "yes", "please", "de", "do", "da", "dos", "das", "um", "uma",
    "esse", "essa", "isso", "foto", "fotos", "imagem", "imagens", "detalhe", "detalhes", "ver", "enviar",
  ]);

  type VehicleMention = { brand: string; model: string; full: string; sourceIndex: number };
  const vehicleMentions: VehicleMention[] = [];

  for (let idx = 0; idx < conversationMessages.length; idx++) {
    const msg = conversationMessages[idx];
    if (!msg || (msg.role !== "assistant" && msg.role !== "user")) continue;

    const rawContent = String(msg.content || "");
    const normalizedContent = rawContent
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Common Portuguese words that appear after brand names but are NOT model names
    const notModelWords = new Set([
      "vale", "tem", "esta", "esse", "essa", "isso", "que", "com", "por", "para", "mas",
      "nao", "sim", "muito", "mais", "menos", "bem", "mal", "bom", "boa", "legal",
      "otimo", "otima", "pode", "vou", "vai", "era", "seria", "foi", "sao", "era",
      "novo", "nova", "usado", "usada", "caro", "cara", "barato", "barata",
      "aqui", "ali", "la", "onde", "quando", "como", "porque", "pois",
      "olha", "veja", "acho", "gosto", "quero", "prefiro", "preciso",
      "realmente", "certamente", "excelente", "perfeito", "perfeita",
      // Words that caused false extractions in production:
      "entrar", "no", "nosso", "nossa", "nossas", "nossos", "patio", "loja", "estoque",
      "disponivel", "disponibilidade", "outra", "outro", "hora", "vezes", "vez",
      "fala", "falou", "falar", "disse", "diz", "dizer", "voce", "voces",
      "temos", "tinha", "tinham", "ter", "tendo", "sera", "serao",
      "ainda", "tambem", "ja", "nunca", "sempre", "agora", "depois", "antes",
      "carro", "carros", "veiculo", "veiculos", "modelo", "modelos", "marca",
      "avisasse", "avisar", "avise", "avisa", "assim",
    ]);

    // Known model names that should be captured (whitelist approach for short words)
    const knownModels = new Set([
      "q3", "q5", "q7", "q8", "a1", "a3", "a4", "a5", "a6", "a7", "a8", "tt", "rs3", "rs5", "rs6", "rs7",
      "x1", "x2", "x3", "x4", "x5", "x6", "x7", "m3", "m4", "m5",
      "c180", "c200", "c250", "c300", "e300", "e350", "gla", "glb", "glc", "gle", "gls", "cla",
      "onix", "hb20", "corolla", "civic", "creta", "tracker", "nivus", "kicks", "polo", "virtus",
      "compass", "renegade", "hilux", "s10", "ranger", "amarok", "toro", "strada", "saveiro",
      "cruze", "cobalt", "prisma", "argo", "mobi", "kwid", "gol", "fit", "city", "sentra",
      "jetta", "tucson", "sportage", "duster", "captur", "ecosport", "bronco", "equinox",
      "trailblazer", "jolion", "territory", "haval",
    ]);

    for (const brand of knownBrands) {
      const pattern = new RegExp(`\\b${escapeRegExp(brand)}\\b\\s+([a-z0-9][a-z0-9./-]*(?:\\s+[a-z0-9][a-z0-9./-]*){0,4})`, "gi");
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(normalizedContent)) !== null) {
        const rawModel = (m[1] || "").trim();
        if (!rawModel) continue;
        // Filter model tokens: keep only those that are known models OR not in notModelWords
        const modelTokens = rawModel.split(/\s+/).filter((t: string) => {
          const tLower = t.toLowerCase();
          if (knownModels.has(tLower)) return true; // Always keep known models
          if (notModelWords.has(tLower)) return false; // Reject known non-model words
          if (t.length < 2) return false; // Too short
          return true;
        });
        if (!modelTokens.length) continue;
        const model = modelTokens.slice(0, 3).join(" ");
        const full = `${brand} ${model}`.trim();
        vehicleMentions.push({ brand, model, full, sourceIndex: idx });
      }

      // Brand-only mention fallback (e.g. "tem audi?")
      if (new RegExp(`\\b${escapeRegExp(brand)}\\b`, "i").test(normalizedContent)) {
        vehicleMentions.push({ brand, model: "", full: brand, sourceIndex: idx });
      }
    }
  }

  if (!vehicleMentions.length) return null;

  const mentionToArgs = (mention: VehicleMention) => {
    const modelTokens = (mention.model || "").split(/\s+/).filter(t => t.length >= 1).slice(0, 3).join(" ");
    const searchTerm = (modelTokens || mention.model || mention.brand).trim();
    const args: Record<string, any> = { marca: mention.brand };
    if (searchTerm) args.search = searchTerm;
    return args;
  };

  // If user answered only with a polite affirmative, assume latest discussed vehicle
  if (isAffirmativeOnly || isGenericPhotoRequest) {
    const latestMention = vehicleMentions[vehicleMentions.length - 1];
    const args = mentionToArgs(latestMention);
    console.log(`[extractVehicleFromContext] ${isGenericPhotoRequest ? "Generic photo request" : "Affirmative"} → using latest vehicle: ${latestMention.full} → args: ${JSON.stringify(args)}`);
    return args;
  }

  const userTokens = normalizedUser
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t));

  // If no useful tokens remain (user asked something generic like "tem fotos desse?"),
  // fall back to the most recently discussed vehicle
  if (userTokens.length === 0) {
    const latestMention = vehicleMentions[vehicleMentions.length - 1];
    const args = mentionToArgs(latestMention);
    console.log(`[extractVehicleFromContext] No useful tokens → using latest vehicle: ${latestMention.full} → args: ${JSON.stringify(args)}`);
    return args;
  }

  let bestMatch: VehicleMention | null = null;
  let bestScore = 0;

  for (const vehicle of vehicleMentions) {
    const vehicleTokens = vehicle.full.split(/\s+/).filter((t) => t.length >= 2);
    let score = 0;

    for (const ut of userTokens) {
      for (const vt of vehicleTokens) {
        if (vt === ut) { score += 3; continue; }
        if (vt.startsWith(ut) || ut.startsWith(vt)) { score += 2; continue; }
        if (Math.abs(vt.length - ut.length) <= 2 && fuzzyMatch(ut, vt)) { score += 2; continue; }
      }
    }

    // Prefer more recent mentions on tie
    if (score > bestScore || (score === bestScore && score > 0 && bestMatch && vehicle.sourceIndex > bestMatch.sourceIndex)) {
      bestScore = score;
      bestMatch = vehicle;
    }
  }

  if (bestMatch && bestScore >= 2) {
    return mentionToArgs(bestMatch);
  }

  // Final fallback: if user tokens didn't match any vehicle well,
  // and the message contains photo/detail keywords, use the most recent vehicle
  const hasPhotoKeyword = /(foto|imagem|image|detalhe|ver|mostrar|enviar)/i.test(normalizedUser);
  if (hasPhotoKeyword && vehicleMentions.length > 0) {
    const latestMention = vehicleMentions[vehicleMentions.length - 1];
    const args = mentionToArgs(latestMention);
    console.log(`[extractVehicleFromContext] Photo keyword fallback → using latest vehicle: ${latestMention.full} → args: ${JSON.stringify(args)}`);
    return args;
  }

  return null;
}

// Simple fuzzy match: checks if two strings differ by at most 2 edits
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  let diffs = 0;
  const maxLen = Math.max(a.length, b.length);
  let ai = 0, bi = 0;
  while (ai < a.length && bi < b.length) {
    if (a[ai] !== b[bi]) {
      diffs++;
      if (diffs > 2) return false;
      if (a.length > b.length) ai++;
      else if (b.length > a.length) bi++;
      else { ai++; bi++; }
    } else { ai++; bi++; }
  }
  return diffs + (a.length - ai) + (b.length - bi) <= 2;
}

function hasMarkdownImages(content: string): boolean {
  return /!\[.*?\]\(https?:\/\/[^\s)]+\)/i.test(content);
}

function isClosingQuestion(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Detect typical closing/follow-up questions from an SDR
  return /(\?|algum|gostou|achou|interesse|agendar|visita|teste|duvida|posso ajudar|chamou atencao|quer saber|o que acha)/.test(normalized)
    && text.length < 300; // Closing questions are short
}

function protectNumericDots(text: string): string {
  // Protect thousand separators (e.g. "115.900") AND decimal dots (e.g. "2.0", "1.6", "3.5")
  // so sentence split does not break prices or engine specs
  return text
    .replace(/(\d)\.(?=\d{3}(\D|$))/g, "$1__NUM_DOT__")  // thousand separators: 115.900
    .replace(/(\d)\.(\d{1,2})(?=\s|[^0-9]|$)/g, "$1__NUM_DOT__$2"); // decimals: 2.0, 1.6T, 3.5
}

function restoreNumericDots(text: string): string {
  return text.replace(/__NUM_DOT__/g, ".");
}

function splitIntoMessages(content: string): string[] {
  // Split by double-newline into natural paragraphs
  const rawParagraphs = content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const imgRegex = /!\[.*?\]\(https?:\/\/[^\s)]+\)/g;

  // Classify each paragraph
  type Block = { type: "text" | "images"; content: string; images?: string[] };
  const allBlocks: Block[] = [];

  for (const para of rawParagraphs) {
    const images: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(para)) !== null) images.push(m[0]);
    imgRegex.lastIndex = 0;

    const textOnly = para.replace(imgRegex, "").replace(/\n{2,}/g, "\n").trim();

    if (images.length > 0) {
      if (textOnly) allBlocks.push({ type: "text", content: textOnly });
      allBlocks.push({ type: "images", content: images.join("\n"), images });
    } else if (textOnly) {
      // Split long text paragraphs into sentence-level blocks for shorter WhatsApp bubbles
      if (textOnly.length > 250) {
        const protectedText = protectNumericDots(textOnly);
        // Split by sentence boundaries (. ! ?) but preserve protected numeric separators
        // Use a safer split that doesn't lose unmatched segments
        const sentenceSplitRegex = /(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ])/g;
        const sentences = protectedText.split(sentenceSplitRegex).filter(s => s.trim());
        let chunk = "";
        for (const s of sentences) {
          if (chunk && (chunk.length + s.length > 250)) {
            allBlocks.push({ type: "text", content: restoreNumericDots(chunk.trim()) });
            chunk = s;
          } else {
            chunk += s;
          }
        }
        if (chunk.trim()) allBlocks.push({ type: "text", content: restoreNumericDots(chunk.trim()) });
      } else {
        allBlocks.push({ type: "text", content: textOnly });
      }
    }
  }

  const hasImages = allBlocks.some((b) => b.type === "images");

  // If there are images, enforce strict ordering:
  // 1. Intro text (short text blocks BEFORE first image, max 1 block)
  // 2. ALL image blocks consolidated together
  // 3. ALL remaining text blocks AFTER images
  if (hasImages) {
    const introTexts: Block[] = [];
    const imageBlocks: Block[] = [];
    const afterTexts: Block[] = [];
    let seenFirstImage = false;

    for (const b of allBlocks) {
      if (b.type === "images") {
        seenFirstImage = true;
        imageBlocks.push(b);
      } else if (!seenFirstImage && b.content.length < 200) {
        // Short intro text before any image — keep it before
        introTexts.push(b);
      } else {
        // Everything else goes AFTER all images
        afterTexts.push(b);
      }
    }

    // Rebuild: intro → images → after
    allBlocks.length = 0;
    // Keep ALL intro text blocks so no content is lost
    allBlocks.push(...introTexts);
    allBlocks.push(...imageBlocks);
    allBlocks.push(...afterTexts);
  }

  // Build final parts: batch images by 3, group adjacent text blocks (up to 400 chars)
  const parts: string[] = [];
  let pendingText = "";

  for (const block of allBlocks) {
    if (block.type === "images") {
      // Flush text before images
      if (pendingText.trim()) {
        parts.push(pendingText.trim());
        pendingText = "";
      }
      // Batch images by 3
      const imgs = block.images || block.content.split("\n");
      for (let i = 0; i < imgs.length; i += 3) {
        parts.push(imgs.slice(i, i + 3).join("\n"));
      }
    } else {
      // Group short text; flush when > 250 chars for WhatsApp-like short bubbles
      if (pendingText && (pendingText.length + block.content.length > 250)) {
        parts.push(pendingText.trim());
        pendingText = block.content;
      } else {
        pendingText += (pendingText ? "\n\n" : "") + block.content;
      }
    }
  }
  if (pendingText.trim()) parts.push(pendingText.trim());

  const allParts = parts.length ? parts : [content];

  // Dedup
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of allParts) {
    const normalized = part.replace(/\s+/g, " ").trim().toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(part);
    }
  }

  return deduped.length ? deduped : [content];
}

// ---------- provider base URLs ----------
const PROVIDER_URLS: Record<string, string> = {
  "Google Gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  Gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  OpenAI: "https://api.openai.com/v1/chat/completions",
  Anthropic: "https://api.anthropic.com/v1/messages",
  Groq: "https://api.groq.com/openai/v1/chat/completions",
};

// ---------- tool execution ----------
interface ToolDef {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  function_def: any;
  execution_config: any;
  endpoint: string | null;
  auth_config: any;
}

async function executeTool(tool: ToolDef, args: Record<string, any>, supabase: any, agentId: string, userText?: string): Promise<string> {
  try {
    switch (tool.tool_type) {
      case "sql_query": {
        const config = tool.execution_config || {};
        const queryTemplate = config.query_template;
        const paramMapping: string[] = config.param_mapping || [];
        if (!queryTemplate) return JSON.stringify({ error: "Tool has no query_template configured" });

        // Get tenant schema for this agent
        const { data: agent } = await supabase
          .from("agents")
          .select("tenant_id, tenants(db_name)")
          .eq("id", agentId)
          .single();

        const schema = agent?.tenants?.db_name;
        if (!schema) return JSON.stringify({ error: "Tenant schema not provisioned" });

        // Replace schema placeholder and execute
        const finalQuery = queryTemplate.replace(/\{schema\}/g, schema);
        const params = paramMapping.map((p: string) => args[p] ?? null);

        // Execute via RPC that runs parameterized queries
        const { data, error } = await supabase.rpc("execute_tenant_query", {
          p_agent_id: agentId,
          p_query: finalQuery,
          p_params: JSON.stringify(params),
        });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      case "web_scraper": {
        const config = tool.execution_config || {};
        const targetUrl = args.url || config.default_url;
        if (!targetUrl) return JSON.stringify({ error: "No URL provided" });

        const response = await fetch(targetUrl, {
          headers: { "User-Agent": "NexusAI-Bot/1.0" },
        });

        if (!response.ok) return JSON.stringify({ error: `HTTP ${response.status}` });

        const html = await response.text();
        // Extract text content (basic HTML stripping)
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, config.max_chars || 8000);

        return JSON.stringify({ url: targetUrl, content: text });
      }

      case "api_rest": {
        const config = tool.execution_config || {};
        const url = config.url_template
          ? config.url_template.replace(/\{(\w+)\}/g, (_: string, key: string) => args[key] ?? "")
          : tool.endpoint;

        if (!url) return JSON.stringify({ error: "No endpoint configured" });

        const method = (config.method || "GET").toUpperCase();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(config.headers || {}),
        };

        // Add auth if configured
        if (tool.auth_config?.api_key) {
          headers["Authorization"] = `Bearer ${tool.auth_config.api_key}`;
        }

        const fetchOpts: RequestInit = { method, headers };
        if (method !== "GET" && method !== "HEAD") {
          fetchOpts.body = JSON.stringify(args);
        }

        const response = await fetch(url, fetchOpts);
        const data = await response.text();

        try {
          return JSON.stringify(JSON.parse(data));
        } catch {
          return data.slice(0, config.max_chars || 8000);
        }
      }

      case "rag_search": {
        // Semantic search in tenant's knowledge base
        const query = args.query || args.search || args.pergunta || "";
        if (!query) return JSON.stringify({ error: "No search query provided" });

        const { data, error } = await supabase.rpc("search_knowledge", {
          p_agent_id: agentId,
          p_query: query,
          p_limit: args.limit || 5,
        });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify(data ?? []);
      }

      case "inventory_query": {
        console.log(`inventory_query args: ${JSON.stringify(args)}`);
        // Query inventory filtered by agent's tenant_id
        const { data: agentData } = await supabase
          .from("agents")
          .select("tenant_id")
          .eq("id", agentId)
          .single();

        if (!agentData?.tenant_id) return JSON.stringify({ error: "Agent has no tenant assigned" });

        let query = supabase
          .from("inventory")
          .select("*")
          .eq("tenant_id", agentData.tenant_id)
          .eq("status", "available");

        // Apply optional filters — search across ALL text fields for model/brand
        const brandArg = args.brand || args.marca;
        const modelArg = args.model || args.modelo;
        // Helper: expand "c180" → ["c180", "c 180"] to handle space-separated model codes
        const expandModelVariants = (term: string): string[] => {
          const variants = [term];
          // Match patterns like "c180", "a3", "q5", "glc300", "x1" — letter(s) followed by number(s)
          const m = term.match(/^([a-zA-Z]+)(\d+.*)$/i);
          if (m) variants.push(`${m[1]} ${m[2]}`);
          // Also handle "c 180" → "c180"
          const noSpace = term.replace(/\s+/g, "");
          if (noSpace !== term) variants.push(noSpace);
          return [...new Set(variants)];
        };

        if (brandArg) {
          const bVariants = expandModelVariants(brandArg);
          const orParts = bVariants.flatMap(v => [`brand.ilike.%${v}%`, `model.ilike.%${v}%`, `version.ilike.%${v}%`, `description.ilike.%${v}%`]);
          query = query.or(orParts.join(","));
        }
        if (modelArg) {
          const mVariants = expandModelVariants(modelArg);
          const orParts = mVariants.flatMap(v => [`model.ilike.%${v}%`, `version.ilike.%${v}%`, `brand.ilike.%${v}%`, `description.ilike.%${v}%`]);
          query = query.or(orParts.join(","));
        }
        if (args.search || args.query || args.termo) {
          const term = args.search || args.query || args.termo;
          const sVariants = expandModelVariants(term);
          const orParts = sVariants.flatMap(v => [`brand.ilike.%${v}%`, `model.ilike.%${v}%`, `version.ilike.%${v}%`, `description.ilike.%${v}%`, `color.ilike.%${v}%`]);
          query = query.or(orParts.join(","));
        }
        if (args.tipo_veiculo) {
          const tipo = args.tipo_veiculo.toLowerCase();
          // Map vehicle body types to known model names since inventory data
          // typically doesn't contain the word "SUV"/"Sedan" etc. literally
          const BODY_TYPE_MODELS: Record<string, string[]> = {
            suv: ["tracker", "creta", "tucson", "sportage", "renegade", "compass", "t-cross", "tcross", "nivus", "kicks", "hr-v", "hrv", "cr-v", "crv", "rav4", "tiggo", "duster", "captur", "ecosport", "territory", "corolla cross", "haval", "jolion", "bronco", "edge", "equinox", "trailblazer", "sw4", "hilux sw4", "ix35"],
            sedan: ["corolla", "civic", "sentra", "cruze", "jetta", "virtus", "onix plus", "hb20s", "prisma", "cobalt", "voyage", "logan", "versa", "yaris sedan", "city", "a3 sedan", "a4", "serie 3", "c4 lounge", "fluence"],
            hatch: ["onix", "hb20", "polo", "gol", "argo", "mobi", "kwid", "sandero", "yaris", "fit", "up", "ka", "fiesta"],
            picape: ["hilux", "s10", "ranger", "amarok", "toro", "strada", "saveiro", "montana", "maverick", "frontier", "l200", "triton", "oroch"],
          };
          const modelsList = BODY_TYPE_MODELS[tipo];
          if (modelsList && modelsList.length > 0) {
            // Build OR filter matching any known model for this body type
            const orParts = modelsList.flatMap(m => [
              `model.ilike.%${m}%`,
              `version.ilike.%${m}%`,
              `description.ilike.%${m}%`,
            ]);
            // Also include the original tipo in case data does contain "SUV" literally
            orParts.push(`description.ilike.%${tipo}%`, `version.ilike.%${tipo}%`, `model.ilike.%${tipo}%`);
            query = query.or(orParts.join(","));
          } else {
            query = query.or(`description.ilike.%${tipo}%,version.ilike.%${tipo}%,model.ilike.%${tipo}%`);
          }
        }
        if (args.year || args.ano) query = query.eq("year", args.year || args.ano);
        if (args.fuel_type || args.fuel || args.combustivel) query = query.ilike("fuel_type", `%${args.fuel_type || args.fuel || args.combustivel}%`);
        if (args.transmission || args.cambio) {
          const txVal = (args.transmission || args.cambio || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          // Use short prefix to handle HTML-entity encoded values (e.g. Autom&#225;tico)
          const txShort = txVal.slice(0, 5); // "autom" or "manua"
          // Search transmission column AND model/version (which often contain "AUTOMÁTICO" properly)
          query = query.or(`transmission.ilike.%${txShort}%,model.ilike.%${txVal}%,version.ilike.%${txVal}%`);
        }
        const minPrice = args.min_price || args.preco_min || args.preco_minimo || args.valor_min;
        const maxPrice = args.max_price || args.preco_max || args.preco_maximo || args.valor_max;
        if (minPrice) query = query.gte("price", minPrice);
        if (maxPrice) query = query.lte("price", maxPrice);
        if (args.color || args.cor) query = query.ilike("color", `%${args.color || args.cor}%`);

        // No limit — return all matching vehicles
        query = query.order("price", { ascending: true });

        const { data, error } = await query;

        console.log(`Inventory query result: ${data?.length ?? 0} vehicles found, error: ${error?.message ?? 'none'}`);

        if (error) return JSON.stringify({ error: error.message });
        if (!data?.length) return JSON.stringify({ message: "Nenhum veículo encontrado com esses filtros" });

        // Determine if user explicitly asked for PHOTOS/IMAGES (not just "quero ver" which means "want to see options")
        const photoRequestPattern = /(foto|imagem|image|photo|manda foto|envia foto|pode enviar|enviar fotos|ver foto|ver imagem|mostra foto|mostra imagem)/i;
        const isPhotoRequest = photoRequestPattern.test(userText || "");
        // Only show photos when user explicitly asks for photos AND it's a specific vehicle query (few results)
        const isSpecificWithPhotos = isPhotoRequest && data.length <= 3;

        return JSON.stringify({
          total: data.length,
          _hint: isSpecificWithPhotos
            ? "Envie TODAS as fotos do array 'photos' usando ![foto](URL). Antes das fotos, escreva UMA frase curta e VARIADA (NUNCA repita 'Aqui estão as fotos'). Use variações como: 'Dá uma olhada!', 'Olha só como ela está!', 'Veja que linda!', 'Tá aqui pra você conferir!'. PROIBIDO inventar atributos, acabamento, materiais ou equipamentos que não estejam explicitamente nos campos do veículo. NÃO faça pergunta de fechamento nesta mensagem — deixe o cliente reagir às fotos primeiro."
            : `Apresente os ${data.length} veículos de forma NATURAL, como um vendedor experiente no WhatsApp. REGRAS ANTI-REPETIÇÃO: 1) NÃO repita o nome completo do carro se já mencionou antes — use apelidos curtos ("o Nivus", "o Haval", "esse aqui"). 2) Varie a estrutura das frases — cada parágrafo deve soar diferente. 3) NÃO use a mesma abertura para todos os carros. 4) Destaque algo ÚNICO de cada um (um é mais econômico, outro tem mais espaço, etc). 5) Finalize com UMA pergunta natural tipo "Algum te chamou atenção?". NÃO use listas numeradas. NÃO inclua fotos. NÃO repita dados que o cliente já sabe.`,
          vehicles: data.map((v: any) => {
            if (!isSpecificWithPhotos) {
              // Listing mode: compact, no photos to keep context small
              return {
                id: v.id,
                brand: v.brand,
                model: v.model,
                version: v.version,
                year: v.year,
                price: v.price,
                mileage: v.mileage,
                fuel_type: v.fuel_type,
                transmission: v.transmission,
                color: v.color,
              };
            }

            // Specific vehicle: include all photos (handle double-escaped JSON)
            let parsedPhotos: string[] = [];
            if (Array.isArray(v.photos)) {
              parsedPhotos = v.photos.filter((p: unknown) => typeof p === "string") as string[];
            } else if (typeof v.photos === "string" && v.photos.trim()) {
              let raw = v.photos.trim();
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  const decoded = JSON.parse(raw);
                  if (Array.isArray(decoded)) {
                    parsedPhotos = decoded.filter((p: unknown) => typeof p === "string") as string[];
                    break;
                  } else if (typeof decoded === "string") {
                    raw = decoded;
                  } else { break; }
                } catch { break; }
              }
            }

            const allPhotos = Array.from(
              new Set([...(v.photo_url ? [v.photo_url] : []), ...parsedPhotos])
            ).map(cleanPhotoUrl).filter(isValidPhotoUrl);

            return {
              id: v.id,
              brand: v.brand,
              model: v.model,
              version: v.version,
              year: v.year,
              price: v.price,
              mileage: v.mileage,
              fuel_type: v.fuel_type,
              transmission: v.transmission,
              color: v.color,
              photo_url: allPhotos[0] ?? v.photo_url,
              photos: allPhotos,
              detail_url: v.detail_url,
            };
          }),
        });
      }

      case "nearest_unit": {
        // Find nearest unit by CEP using the find-nearest-unit edge function
        const cep = args.cep || args.CEP || "";
        if (!cep) return JSON.stringify({ error: "CEP é obrigatório" });

        const { data: agentData } = await supabase
          .from("agents")
          .select("tenant_id")
          .eq("id", agentId)
          .single();

        const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
        const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

        const resp = await fetch(`${cloudUrl}/functions/v1/find-nearest-unit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cloudKey}`,
          },
          body: JSON.stringify({ cep, tenant_id: agentData?.tenant_id }),
        });

        const result = await resp.text();
        try {
          return JSON.stringify(JSON.parse(result));
        } catch {
          return result.slice(0, 8000);
        }
      }

      case "fipe_query": {
        // Query FIPE table via the fipe-query edge function
        const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
        const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

        const fipeArgs: Record<string, any> = {};
        if (args.marca || args.brand) fipeArgs.marca = args.marca || args.brand;
        if (args.modelo || args.model) fipeArgs.modelo = args.modelo || args.model;
        if (args.ano || args.year) fipeArgs.ano = args.ano || args.year;
        if (args.codigo_fipe) fipeArgs.codigo_fipe = args.codigo_fipe;
        if (args.tipo) fipeArgs.tipo = args.tipo;

        const resp = await fetch(`${cloudUrl}/functions/v1/fipe-query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cloudKey}`,
          },
          body: JSON.stringify(fipeArgs),
        });

        const result = await resp.text();
        try {
          return JSON.stringify(JSON.parse(result));
        } catch {
          return result.slice(0, 8000);
        }
      }

      default:
        return JSON.stringify({ error: `Unknown tool type: ${tool.tool_type}` });
    }
  } catch (e: any) {
    console.error(`Tool execution error (${tool.name}):`, e);
    return JSON.stringify({ error: e.message || "Tool execution failed" });
  }
}

// ---------- built-in parameter schemas for known tool types ----------
const BUILTIN_SCHEMAS: Record<string, { description: string; parameters: any }> = {
  inventory_query: {
    description: "Consulta o estoque de veículos da concessionária. ATENÇÃO: 'marca' é SOMENTE para fabricantes (Toyota, BMW, Hyundai, Fiat, Chevrolet, Volkswagen, Haval, etc.). Tipos de carroceria como SUV, Sedan, Hatch, Picape NÃO são marcas — use o campo 'tipo_veiculo' para isso.",
    parameters: {
      type: "object",
      properties: {
        marca:  { type: "string", description: "SOMENTE a marca/fabricante do veículo (ex: Haval, Toyota, BMW, Chevrolet, Fiat, Hyundai, Volkswagen). NUNCA use para tipo de carroceria (SUV, Sedan, etc.)" },
        modelo: { type: "string", description: "Modelo do veículo (ex: Onix, HB20, Corolla, Fusca, Creta, Tracker)" },
        tipo_veiculo: { type: "string", description: "Tipo/carroceria do veículo: SUV, Sedan, Hatch, Picape, Minivan, Conversível, Coupé. Use quando o cliente pedir por categoria e não por marca/modelo específico." },
        search: { type: "string", description: "Termo genérico de busca livre quando não se encaixa nos outros campos" },
        ano:    { type: "integer", description: "Ano do veículo" },
        cor:    { type: "string", description: "Cor do veículo" },
        combustivel:  { type: "string", description: "Tipo de combustível (flex, gasolina, diesel, elétrico)" },
        cambio:       { type: "string", description: "Tipo de câmbio (manual, automático)" },
        preco_min:    { type: "number", description: "Preço mínimo em reais" },
        preco_max:    { type: "number", description: "Preço máximo em reais" },
      },
      required: [],
    },
  },
  nearest_unit: {
    description: "Encontra a unidade/loja mais próxima do cliente com base na localização informada.",
    parameters: {
      type: "object",
      properties: {
        endereco: { type: "string", description: "Endereço ou cidade do cliente" },
        latitude:  { type: "number", description: "Latitude do cliente" },
        longitude: { type: "number", description: "Longitude do cliente" },
      },
      required: [],
    },
  },
  fipe_query: {
    description: "Consulta o preço de referência da Tabela FIPE para um veículo. Informe marca, modelo e opcionalmente o ano.",
    parameters: {
      type: "object",
      properties: {
        marca:  { type: "string", description: "Marca do veículo (ex: Toyota, Honda, Chevrolet, Volkswagen)" },
        modelo: { type: "string", description: "Modelo do veículo (ex: Corolla, Civic, Onix, Polo)" },
        ano:    { type: "integer", description: "Ano do veículo (ex: 2023)" },
        codigo_fipe: { type: "string", description: "Código FIPE direto se disponível (ex: 001004-9)" },
        tipo:   { type: "integer", description: "Tipo: 1=carros (padrão), 2=motos, 3=caminhões" },
      },
      required: ["marca", "modelo"],
    },
  },
};

// ---------- convert tools to OpenAI format ----------
function toolsToOpenAI(tools: ToolDef[]) {
  return tools.map((t) => {
    const builtin = BUILTIN_SCHEMAS[t.tool_type];
    const hasValidParams = t.function_def?.parameters && t.function_def.parameters.type === "object"
      && t.function_def.parameters.properties && Object.keys(t.function_def.parameters.properties).length > 0;

    return {
      type: "function" as const,
      function: {
        name: t.function_def?.name || t.name,
        description: (hasValidParams ? t.function_def?.description : null) || builtin?.description || t.description || t.name,
        parameters: hasValidParams
          ? t.function_def.parameters
          : (builtin?.parameters || { type: "object", properties: {}, required: [] }),
      },
    };
  });
}

// ---------- usage event helper ----------
async function recordUsageEvent(
  supabaseAdmin: any,
  params: {
    tenant_id: string;
    agent_id: string;
    conversation_id?: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    latency_ms?: number;
    tool_calls_count: number;
    phase: "dispatcher" | "conversational";
  }
) {
  try {
    await supabaseAdmin
      .from("usage_events")
      .insert({
        tenant_id: params.tenant_id,
        agent_id: params.agent_id,
        conversation_id: params.conversation_id || null,
        provider: params.provider,
        model: params.model,
        prompt_tokens: params.prompt_tokens,
        completion_tokens: params.completion_tokens,
        latency_ms: params.latency_ms ?? null,
        tool_calls_count: params.tool_calls_count,
        phase: params.phase,
      });
  } catch (e: any) {
    console.warn("[UsageEvent] Failed to record:", e?.message || e);
  }
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ---------- Log Collector ----------
  // Captures console.log/warn/error for streaming back to sandbox UI
  const collectedLogs: { timestamp: string; level: string; message: string }[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const captureLog = (level: string, ...args: any[]) => {
    const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
    collectedLogs.push({ timestamp: new Date().toISOString().slice(11, 23), level, message: msg });
  };
  console.log = (...args) => { captureLog("log", ...args); origLog(...args); };
  console.warn = (...args) => { captureLog("warn", ...args); origWarn(...args); };
  console.error = (...args) => { captureLog("error", ...args); origError(...args); };

  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY");
    const nexusServiceKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY");

    if (!encryptionKey || !nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("x-nexus-auth") || "";
    const supabase = createClient(nexusUrl, nexusKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    // Service-role client for usage_events inserts (bypasses RLS)
    const supabaseAdmin = nexusServiceKey
      ? createClient(nexusUrl, nexusServiceKey)
      : supabase;

    const { agent_id, messages, conversation_id, attachments } = await req.json();

    if (!agent_id || (!messages?.length && !(attachments?.length))) {
      return new Response(JSON.stringify({ error: "agent_id and messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load agent + provider + tenant settings (including dispatcher_provider_id)
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("*, providers(name, base_url, api_key_encrypted), tenants(slug, settings)")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: "Agent not found", detail: agentErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = agent.providers;
    if (!provider?.api_key_encrypted) {
      return new Response(JSON.stringify({ error: "Provider has no API key configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Decrypt API key
    const apiKey = await decrypt(provider.api_key_encrypted, encryptionKey);

    // 3. Load agent tools
    let agentTools: ToolDef[] = [];
    try {
      const { data, error } = await supabase.rpc("load_agent_tools", { p_agent_id: agent_id });
      if (!error && data) agentTools = data;
    } catch (e) {
      console.warn("Could not load agent tools:", e);
    }

    // SAFETY NET: For PPL appraisal flow, ensure FIPE tool is always available to dispatcher.
    // Some agents are misconfigured with only inventory_query linked, which prevents fipe_query tool calls.
    const tenantSlugLoaded = (agent.tenants as any)?.slug || "";
    const isPplTenant = tenantSlugLoaded === "ppl-motors" || tenantSlugLoaded === "ppl-mortors";
    const hasFipeToolLinked = agentTools.some((t) => t.tool_type === "fipe_query");

    if (isPplTenant && !hasFipeToolLinked) {
      const virtualFipeTool: ToolDef = {
        id: "virtual-fipe-query-tool",
        name: "consultar_fipe",
        description: "Consulta o valor de referência da Tabela FIPE para avaliação de veículo do cliente.",
        tool_type: "fipe_query",
        function_def: {
          name: "consultar_fipe",
          description: "Consulta a Tabela FIPE para avaliação de troca/pre-avaliação do veículo do cliente.",
          parameters: {
            type: "object",
            properties: {
              marca: { type: "string", description: "Marca do veículo (ex: Chevrolet, Toyota, Honda)" },
              modelo: { type: "string", description: "Modelo do veículo (ex: Cruze, Corolla, Civic)" },
              ano: { type: "integer", description: "Ano do veículo (ex: 2020)" },
            },
            required: ["marca", "modelo"],
          },
        },
        execution_config: {},
        endpoint: null,
        auth_config: {},
      };
      agentTools.push(virtualFipeTool);
      console.warn("[Tools] fipe_query missing from agent_tools; injected virtual consultar_fipe for PPL tenant");
    }

    console.log(`[Tools] Loaded ${agentTools.length} tool(s): ${agentTools.map((t) => `${t.name}:${t.tool_type}`).join(", ")}`);


    // 4. Memory: create or reuse conversation
    let convId = conversation_id;
    if (!convId) {
      try {
        const { data, error } = await supabase.rpc("create_conversation", {
          p_agent_id: agent_id,
          p_channel: "sandbox",
        });
        if (!error && data) convId = data;
      } catch (e) {
        console.warn("Could not create conversation:", e);
      }
    }

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    const hasIncomingAttachments = Array.isArray(attachments) && attachments.length > 0;

    // For media messages, we defer persistence until after transcription/image notes are appended
    if (convId && lastUserMsg?.role === "user" && !hasIncomingAttachments) {
      try {
        const { data: savedUserMsg, error: saveUserErr } = await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "user",
          p_content: lastUserMsg.content,
          p_model: null,
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: null,
          p_metadata: null,
        });
        if (saveUserErr) {
          console.error("[SaveUser] FAILED:", saveUserErr.message, saveUserErr.details, saveUserErr.hint);
        } else {
          console.log("[SaveUser] OK, msg_id:", savedUserMsg, "conv:", convId, "content_len:", lastUserMsg.content?.length);
        }
      } catch (e: any) {
        console.error("[SaveUser] EXCEPTION:", e?.message || e);
      }
    } else if (convId && lastUserMsg?.role === "user" && hasIncomingAttachments) {
      console.log("[SaveUser] Deferred for media attachments");
    } else {
      console.warn("[SaveUser] SKIPPED: convId=", convId, "lastRole=", lastUserMsg?.role);
    }

    // 5. Determine endpoint
    const baseUrl = (provider.base_url && provider.base_url.includes("/chat/completions"))
      ? provider.base_url
      : PROVIDER_URLS[provider.name] || PROVIDER_URLS.OpenAI;

    // 6. Build request — merge tenant LLM config with agent defaults
    const isAnthropic = provider.name === "Anthropic";
    const isGemini = provider.name === "Google Gemini" || provider.name === "Gemini";
    const model = agent.model || "gpt-4o";
    const agentConfig = (agent.config || {}) as Record<string, any>;
    const tenantSettings = (agent.tenants?.settings || {}) as Record<string, any>;
    // Delay config (humanization waits)
    const readDelayMs: number = agentConfig.read_delay_ms ?? 1500;
    const typingDelayMs: number = agentConfig.typing_delay_ms ?? 800;
    const blockGapMs: number = agentConfig.block_gap_ms ?? 1200;
    const llmConfig = tenantSettings.llm_config || {};
    // Priority: agent-level > tenant-level > defaults
    const temperature = agent.temperature ?? llmConfig.temperature ?? 0.7;
    const top_p = agentConfig.top_p ?? llmConfig.top_p ?? undefined;
    const top_k = agentConfig.top_k ?? llmConfig.top_k ?? undefined;
    const tenantSlug = (agent.tenants as any)?.slug || null;
    const hasInventoryTool = agentTools.some(t => t.tool_type === "inventory_query");
    const systemPrompt = buildSystemPrompt(
      agent.system_prompt || "You are a helpful AI assistant.",
      tenantSlug,
      hasInventoryTool,
    );
    console.log(`[Prompts] Tenant slug: ${tenantSlug}, hasInventory: ${hasInventoryTool}, prompt length: ${systemPrompt.length}`);

    // Debug trace must exist before media processing
    const debugTrace: any[] = [];

    // ===== MEDIA ATTACHMENT PROCESSING =====
    // Process audio (transcription) and images (multimodal) from Chatwoot attachments
    const mediaAttachments = (attachments || []) as Array<{ file_type: string; data_url: string; file_size?: number }>;
    const audioAttachments = mediaAttachments.filter(a => a.file_type === "audio");
    const imageAttachments = mediaAttachments.filter(a => a.file_type === "image");
    const fileAttachments = mediaAttachments.filter(a => a.file_type === "file");
    const imageBase64Parts: Array<{ mime_type: string; base64: string }> = [];

    if (mediaAttachments.length > 0) {
      console.log(`[Media] Processing ${audioAttachments.length} audio, ${imageAttachments.length} image, ${fileAttachments.length} file attachment(s)`);
      debugTrace.push({
        type: "media_attachments",
        audio_count: audioAttachments.length,
        image_count: imageAttachments.length,
        file_count: fileAttachments.length,
        timestamp: Date.now(),
      });
    }

    // --- Audio transcription via Gemini ---
    for (const audio of audioAttachments) {
      try {
        console.log(`[Media] Downloading audio: ${audio.data_url.slice(0, 80)}...`);
        const audioResp = await fetch(audio.data_url);
        if (!audioResp.ok) {
          console.error(`[Media] Audio download failed: ${audioResp.status}`);
          continue;
        }
        const audioBuffer = await audioResp.arrayBuffer();
        const audioBytes = new Uint8Array(audioBuffer);
        const audioBase64 = btoa(String.fromCharCode(...audioBytes));

        // Detect MIME type from URL or default to audio/ogg (WhatsApp default)
        const urlLower = audio.data_url.toLowerCase();
        let audioMime = "audio/ogg";
        if (urlLower.includes(".mp3") || urlLower.includes("audio/mpeg")) audioMime = "audio/mp3";
        else if (urlLower.includes(".wav")) audioMime = "audio/wav";
        else if (urlLower.includes(".aac")) audioMime = "audio/aac";
        else if (urlLower.includes(".flac")) audioMime = "audio/flac";
        else if (urlLower.includes(".m4a")) audioMime = "audio/mp4";

        console.log(`[Media] Transcribing audio (${audioBytes.length} bytes, ${audioMime}) via ${provider.name}`);

        // Use the agent's configured Gemini provider for transcription
        const transcriptionResp = await fetch(baseUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Transcreva o áudio a seguir com precisão. Retorne APENAS a transcrição literal do que foi dito, sem explicações ou comentários adicionais. Se o áudio estiver em português, mantenha em português.",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${audioMime};base64,${audioBase64}`,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        });

        if (transcriptionResp.ok) {
          const transcriptionResult = await transcriptionResp.json();
          const transcript = transcriptionResult.choices?.[0]?.message?.content?.trim() || "";
          if (transcript) {
            console.log(`[Media] Audio transcribed (${transcript.length} chars): "${transcript.slice(0, 100)}..."`);
            // Prepend transcript to the last user message
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "user") {
              const originalText = lastMsg.content || "";
              lastMsg.content = originalText
                ? `[Áudio do cliente - transcrição]: "${transcript}"\n\n${originalText}`
                : `[Áudio do cliente - transcrição]: "${transcript}"`;
            } else {
              messages.push({ role: "user", content: `[Áudio do cliente - transcrição]: "${transcript}"` });
            }
            debugTrace.push({
              type: "audio_transcription",
              transcript_length: transcript.length,
              transcript_preview: transcript.slice(0, 200),
              mime_type: audioMime,
              audio_size: audioBytes.length,
              timestamp: Date.now(),
            });
          } else {
            console.warn("[Media] Transcription returned empty content");
          }
        } else {
          const errText = await transcriptionResp.text();
          console.error(`[Media] Transcription API error: ${transcriptionResp.status}`, errText);
          debugTrace.push({ type: "audio_transcription_error", status: transcriptionResp.status, error: errText.slice(0, 200), timestamp: Date.now() });
        }
      } catch (e: any) {
        console.error("[Media] Audio processing error:", e.message);
        debugTrace.push({ type: "audio_transcription_error", error: e.message, timestamp: Date.now() });
      }
    }

    // --- Image processing: download and convert to base64 for multimodal ---
    for (const img of imageAttachments) {
      try {
        console.log(`[Media] Downloading image: ${img.data_url.slice(0, 80)}...`);
        const imgResp = await fetch(img.data_url);
        if (!imgResp.ok) {
          console.error(`[Media] Image download failed: ${imgResp.status}`);
          continue;
        }
        const imgBuffer = await imgResp.arrayBuffer();
        const imgBytes = new Uint8Array(imgBuffer);
        // Limit: skip images > 4MB to avoid payload issues
        if (imgBytes.length > 4 * 1024 * 1024) {
          console.warn(`[Media] Image too large (${imgBytes.length} bytes), skipping`);
          continue;
        }
        const imgBase64 = btoa(String.fromCharCode(...imgBytes));

        const urlLower = img.data_url.toLowerCase();
        let imgMime = "image/jpeg";
        if (urlLower.includes(".png")) imgMime = "image/png";
        else if (urlLower.includes(".webp")) imgMime = "image/webp";
        else if (urlLower.includes(".gif")) imgMime = "image/gif";

        imageBase64Parts.push({ mime_type: imgMime, base64: imgBase64 });
        console.log(`[Media] Image prepared (${imgBytes.length} bytes, ${imgMime})`);
        debugTrace.push({
          type: "image_attachment",
          mime_type: imgMime,
          size: imgBytes.length,
          timestamp: Date.now(),
        });
      } catch (e: any) {
        console.error("[Media] Image processing error:", e.message);
      }
    }

    // --- File attachments: note in user message ---
    for (const file of fileAttachments) {
      const lastMsg = messages[messages.length - 1];
      const fileNote = `[Cliente enviou um arquivo: ${file.data_url.split("/").pop() || "arquivo"}]`;
      if (lastMsg?.role === "user") {
        lastMsg.content = (lastMsg.content || "") + "\n\n" + fileNote;
      } else {
        messages.push({ role: "user", content: fileNote });
      }
    }

    // Persist user message after media processing so Chat ao Vivo can show transcription/notes
    if (convId && lastUserMsg?.role === "user" && hasIncomingAttachments) {
      if (!lastUserMsg.content?.trim()) {
        if (audioAttachments.length > 0) {
          lastUserMsg.content = "[Áudio do cliente - transcrição]: \"(áudio recebido, transcrição indisponível)\"";
        } else if (imageAttachments.length > 0) {
          lastUserMsg.content = "[Cliente enviou imagem]";
        } else if (fileAttachments.length > 0) {
          lastUserMsg.content = "[Cliente enviou arquivo]";
        }
      }

      try {
        const { data: savedUserMsg, error: saveUserErr } = await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "user",
          p_content: lastUserMsg.content || "",
          p_model: null,
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: null,
          p_metadata: null,
        });
        if (saveUserErr) {
          console.error("[SaveUser][Media] FAILED:", saveUserErr.message, saveUserErr.details, saveUserErr.hint);
        } else {
          console.log("[SaveUser][Media] OK, msg_id:", savedUserMsg, "conv:", convId, "content_len:", (lastUserMsg.content || "").length);
        }
      } catch (e: any) {
        console.error("[SaveUser][Media] EXCEPTION:", e?.message || e);
      }
    }

    const startTime = Date.now();
    console.log(`LLM config: temperature=${temperature}, top_p=${top_p}, top_k=${top_k}, isGemini=${isGemini}`);
    // Helper: build optional LLM params (only include if defined)
    // Note: Gemini's OpenAI-compatible endpoint does NOT support top_k or top_p
    const llmParams: Record<string, any> = { temperature };
    if (!isGemini) {
      if (top_p !== undefined && top_p !== null) llmParams.top_p = top_p;
      if (top_k !== undefined && top_k !== null) llmParams.top_k = top_k;
    }

    const openaiTools = agentTools.length > 0 ? toolsToOpenAI(agentTools) : undefined;

    // ---------- Anthropic path (no function calling for now) ----------
    if (isAnthropic) {
      const anthropicMessages = messages.map((m: any) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      }));

      const resp = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model, max_tokens: 4096, system: systemPrompt,
          messages: anthropicMessages, ...llmParams, stream: true,
        }),
      });

      if (!resp.ok) {
        const t = await resp.text();
        console.error("Anthropic error:", resp.status, t);
        return new Response(JSON.stringify({ error: `Provider error: ${resp.status}`, detail: t }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      let fullContent = "";

      (async () => {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        try {
          if (convId) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ conversation_id: convId })}\n\n`));
          }
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6);
              if (json === "[DONE]") continue;
              try {
                const ev = JSON.parse(json);
                if (ev.type === "content_block_delta" && ev.delta?.text) {
                  fullContent += ev.delta.text;
                  const oai = { choices: [{ delta: { content: ev.delta.text } }] };
                  await writer.write(encoder.encode(`data: ${JSON.stringify(oai)}\n\n`));
                }
              } catch { /* skip */ }
            }
          }
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          if (convId && fullContent) {
            const latency = Date.now() - startTime;
            try {
              await supabase.rpc("save_message", {
                p_agent_id: agent_id,
                p_conversation_id: convId,
                p_role: "assistant",
                p_content: fullContent,
                p_model: model,
                p_tokens_input: 0,
                p_tokens_output: 0,
                p_latency_ms: latency,
                p_metadata: null,
              });
            } catch (e: any) { console.warn("Could not save assistant msg:", e); }
          }
        } catch (e) { console.error("stream transform error:", e); }
        await writer.close();
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ---------- OpenAI-compatible path with Tool Dispatcher Architecture ----------
    // Phase 1: Tool Dispatcher (cheap LLM good at tool calling) decides which tools to use
    // Phase 2: Conversational LLM (agent's configured model) generates response with tool data as context

    // Sanitize history: replace photo URLs with markers so LLM doesn't reproduce old photos
    const sanitizedMessages = messages.map((m: any) => {
      if (m.role === "assistant" && m.content && /!\[.*?\]\(https?:\/\//.test(m.content)) {
        const cleaned = m.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, "[foto já enviada anteriormente]");
        return { ...m, content: cleaned };
      }
      return m;
    });

    const fullMessages = [{ role: "system", content: systemPrompt }, ...sanitizedMessages];
    const latestUserText = String(lastUserMsg?.content || "");

    debugTrace.push({ type: "config", model, temperature, top_p, top_k, tools_count: openaiTools?.length || 0, latest_user_text: latestUserText.slice(0, 120) });

    // ===== PHASE 1: TOOL DISPATCHER =====
    const toolResultsContext: string[] = [];

    // ===== PRE-DISPATCHER: FIPE INTERCEPT =====
    // When user explicitly asks about FIPE / appraisal / "meu carro" value,
    // call fipe_query DIRECTLY and flag to block inventory_query in dispatcher.
    let fipeIntercepted = false;
    const normalizedUserForFipe = latestUserText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isFipeExplicitRequest = /(fipe|tabela fipe|valor da fipe|preco fipe|valor fipe)/.test(normalizedUserForFipe);
    const isAppraisalRequest = /(meu carro|meu veiculo|tenho um|tenho uma|quero avaliar|avaliar meu|pre.?avaliacao|avaliacao|quanto vale meu|meu .{2,25} vale|dar na troca|dar como entrada|colocar na troca|colocar como entrada)/.test(normalizedUserForFipe);

    if ((isFipeExplicitRequest || isAppraisalRequest) && openaiTools && openaiTools.length > 0) {
      const fipeTool = agentTools.find(t => t.tool_type === "fipe_query");
      if (fipeTool) {
        // Extract brand/model/year from the LATEST user message + recent context
        const knownBrandsIntercept = ["chevrolet", "toyota", "honda", "hyundai", "volkswagen", "fiat", "ford", "jeep", "nissan", "renault", "mitsubishi", "kia", "peugeot", "citroen", "bmw", "mercedes", "audi", "volvo", "subaru", "suzuki", "ram", "dodge", "caoa", "chery", "byd", "gwm", "land rover", "porsche"];
        const knownModelsIntercept = ["cruze", "onix", "tracker", "spin", "cobalt", "prisma", "s10", "corolla", "civic", "hb20", "creta", "tucson", "compass", "renegade", "polo", "virtus", "gol", "hilux", "ranger", "toro", "argo", "mobi", "kicks", "nivus", "t-cross", "tcross", "fit", "city", "hr-v", "hrv", "duster", "captur", "sentra", "jetta", "amarok", "strada", "saveiro", "kwid", "sportage", "ecosport", "bronco", "equinox", "trailblazer", "jolion", "territory", "q3", "q5", "q7", "a3", "a4", "c180", "c200", "c300", "gla", "glc", "gle", "x1", "x3", "x5"];

        // Scan latest user text + recent messages for vehicle data
        const textsToScan = [
          normalizedUserForFipe,
          ...messages.slice(-6).map((m: any) => String(m.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
        ].join(" ");

        let fMarca = "";
        let fModelo = "";
        let fAno = 0;

        for (const brand of knownBrandsIntercept) {
          if (textsToScan.includes(brand)) { fMarca = brand; break; }
        }
        for (const model of knownModelsIntercept) {
          if (textsToScan.includes(model)) { fModelo = model; break; }
        }
        const yearMatch = textsToScan.match(/\b(19[89]\d|20[0-2]\d)\b/);
        if (yearMatch) fAno = parseInt(yearMatch[1]);

        if (fMarca || fModelo) {
          const fipeArgs: Record<string, any> = {};
          if (fMarca) fipeArgs.marca = fMarca;
          if (fModelo) fipeArgs.modelo = fModelo;
          if (fAno) fipeArgs.ano = fAno;

          console.log(`[FipeIntercept] FIPE request detected — calling fipe_query DIRECTLY: ${JSON.stringify(fipeArgs)}`);
          debugTrace.push({ type: "fipe_intercept", reason: isFipeExplicitRequest ? "explicit_fipe_mention" : "appraisal_context", args: fipeArgs, timestamp: Date.now() });

          try {
            const fipeResult = await executeTool(fipeTool, fipeArgs, supabase, agent_id, latestUserText);
            toolResultsContext.push(`[Resultado da ferramenta "consultar_fipe"]: ${fipeResult}`);
            fipeIntercepted = true;
            console.log(`[FipeIntercept] FIPE result received (${fipeResult.length} chars)`);
            debugTrace.push({ type: "fipe_intercept_result", result_length: fipeResult.length, timestamp: Date.now() });

            // Save to memory
            if (convId) {
              try {
                await supabase.rpc("save_message", {
                  p_agent_id: agent_id, p_conversation_id: convId, p_role: "tool",
                  p_content: fipeResult, p_model: null, p_tokens_input: 0, p_tokens_output: 0,
                  p_latency_ms: null, p_metadata: null,
                });
              } catch {}
            }
          } catch (e: any) {
            console.error("[FipeIntercept] Error:", e.message);
          }
        } else {
          console.log(`[FipeIntercept] FIPE context detected but no brand/model found in text`);
        }
      }
    }

    if (openaiTools && openaiTools.length > 0) {
      // Priority: agent-level config > tenant-level settings (legacy fallback)
      const dispatcherProviderId = agentConfig.dispatcher_provider_id || (agent.tenants?.settings as any)?.dispatcher_provider_id;

      if (!dispatcherProviderId) {
        console.warn("[Dispatcher] No dispatcher_provider_id configured for tenant — skipping tool dispatch");
        debugTrace.push({ type: "dispatcher_skip", reason: "no_dispatcher_provider_configured" });
      } else {
        // Load the dispatcher provider from DB
        const { data: dispatcherProvider, error: dpErr } = await supabase
          .from("providers")
          .select("name, base_url, api_key_encrypted, model_default")
          .eq("id", dispatcherProviderId)
          .single();

        if (dpErr || !dispatcherProvider?.api_key_encrypted) {
          console.warn("[Dispatcher] Could not load dispatcher provider:", dpErr?.message || "no API key");
          debugTrace.push({ type: "dispatcher_skip", reason: "provider_load_failed", error: dpErr?.message });
        } else {
          const dispatcherApiKey = await decrypt(dispatcherProvider.api_key_encrypted, encryptionKey);
          const dispatcherModel = dispatcherProvider.model_default || "gpt-4o-mini";
          const dispatcherBaseUrl = (dispatcherProvider.base_url && dispatcherProvider.base_url.includes("/chat/completions"))
            ? dispatcherProvider.base_url
            : PROVIDER_URLS[dispatcherProvider.name] || PROVIDER_URLS.OpenAI;

          console.log(`[Dispatcher] Using provider "${dispatcherProvider.name}", model: ${dispatcherModel}, url: ${dispatcherBaseUrl}`);
          debugTrace.push({ type: "dispatcher_start", provider: dispatcherProvider.name, model: dispatcherModel, tools_count: openaiTools.length, timestamp: Date.now() });

        // Build dispatcher prompt from registry (per-tenant, managed in code)
        const tenantSlugForDispatcher = (agent.tenants as any)?.slug || null;
        const dispatcherSystemPrompt = getDispatcherPrompt(tenantSlugForDispatcher);
        console.log(`[Dispatcher] Using registry prompt for tenant: ${tenantSlugForDispatcher || "default"}`);

        // === CONTESTATION / SELECTION DETECTION ===
        // When user is questioning/contesting a previous response OR selecting an already-listed option,
        // skip dispatcher to prevent contradictory re-queries.
        const contestationPattern = /^(voce me mandou|voce so mandou|voce enviou|me mandou|mandou so|so mandou|mandou apenas|apenas um|so um|nao era|nao eram|estava errado|estavam erradas|informacao errada|informacoes erradas|contradiz|contradit|voce disse|mas voce|nao entendi|ta errado|incorreto|informacoes incorretas|informacao incorreta|nao bate|voce falou|nao foi isso|corrigir|corrija|retifique|nao confere|conferir)/i;
        const normalizedLatestUser = latestUserText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const isContestationMsg = contestationPattern.test(normalizedLatestUser);

        // Also detect "então não tem X correto?" pattern — user is asking for confirmation, not new data
        const isConfirmationQuestion = /^(entao nao tem|nao tem nenhum|nao tem mais|afinal tem|afinal nao|correto\??|certo\??|isso mesmo|e isso)[\s?!.]*$/i.test(
          normalizedLatestUser.replace(/[^a-z0-9\s?!.]/g, " ").replace(/\s+/g, " ").trim()
        );

        // Check if the user is asking a clarification about a previous assistant response
        const isReactingToPreviousResponse = /^(voce|vc|ce|tu)\s+(me\s+)?(mandou|enviou|passou|falou|disse|mostrou|apresentou)/i.test(normalizedLatestUser);

        // User selecting one option that was already presented in previous assistant message(s)
        const isSelectingPreviousOption = isUserSelectingPreviousOption(latestUserText || "");

        if (isContestationMsg || isConfirmationQuestion || isReactingToPreviousResponse || isSelectingPreviousOption) {
          console.log(`[Dispatcher] Skip detected (contestation/confirmation/reaction/selection): "${latestUserText.slice(0, 80)}"`);
          debugTrace.push({
            type: "dispatcher_skip",
            reason: isContestationMsg
              ? "user_contestation_detected"
              : isConfirmationQuestion
                ? "confirmation_question"
                : isReactingToPreviousResponse
                  ? "reaction_to_previous"
                  : "selection_of_previous_option",
            user_text: latestUserText.slice(0, 120),
            timestamp: Date.now(),
          });
        } else {

        const dispatcherMessages = [
          { role: "system", content: dispatcherSystemPrompt },
          ...messages,
        ];

        let maxDispatchIterations = 3;

        try {
          let currentDispatchMessages = [...dispatcherMessages];

          while (maxDispatchIterations-- > 0) {
            const dispatchResp = await fetch(dispatcherBaseUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${dispatcherApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: dispatcherModel,
                messages: currentDispatchMessages,
                tools: openaiTools,
                tool_choice: "auto",
                temperature: 0.1, // Low temperature for precise tool decisions
                stream: false,
              }),
            });

            if (!dispatchResp.ok) {
              const errText = await dispatchResp.text();
              console.error("[Dispatcher] Error " + dispatchResp.status + ":", errText);
              debugTrace.push({ type: "dispatcher_error", status: dispatchResp.status, error: errText.slice(0, 200), timestamp: Date.now() });
              break; // Fall through to conversational LLM without tools
            }

            const dispatchResult = await dispatchResp.json();
            const dispatchChoice = dispatchResult.choices?.[0];
            const dispatchUsage = dispatchResult.usage;

            if (dispatchUsage) {
              console.log(`[Dispatcher] Tokens: prompt=${dispatchUsage.prompt_tokens}, completion=${dispatchUsage.completion_tokens}, total=${dispatchUsage.total_tokens}`);
              // Record dispatcher usage event
              recordUsageEvent(supabaseAdmin, {
                tenant_id: agent.tenant_id,
                agent_id: agent_id,
                conversation_id: convId,
                provider: dispatcherProvider.name,
                model: dispatcherModel,
                prompt_tokens: dispatchUsage.prompt_tokens || 0,
                completion_tokens: dispatchUsage.completion_tokens || 0,
                tool_calls_count: dispatchChoice?.message?.tool_calls?.length || 0,
                phase: "dispatcher",
              });
            }

            if (!dispatchChoice) {
              console.warn("[Dispatcher] No choice returned");
              break;
            }

            const dispatchMsg = dispatchChoice.message;
            debugTrace.push({
              type: "dispatcher_iteration",
              finish_reason: dispatchChoice.finish_reason,
              has_tool_calls: !!dispatchMsg.tool_calls?.length,
              tool_calls_count: dispatchMsg.tool_calls?.length || 0,
              content_preview: String(dispatchMsg.content || "").slice(0, 120),
              usage: dispatchUsage || null,
              timestamp: Date.now(),
            });

            // No tool calls — dispatcher decided tools aren't needed
            if (!dispatchMsg.tool_calls || dispatchMsg.tool_calls.length === 0) {
              console.log("[Dispatcher] No tools needed");
              break;
            }

            // Execute tool calls from dispatcher
            console.log(`[Dispatcher] Executing ${dispatchMsg.tool_calls.length} tool(s)`);
            debugTrace.push({
              type: "dispatcher_tool_plan",
              tool_names: dispatchMsg.tool_calls.map((tc: any) => tc.function?.name),
              timestamp: Date.now(),
            });

            currentDispatchMessages.push(dispatchMsg);

            for (const toolCall of dispatchMsg.tool_calls) {
              const toolName = toolCall.function.name;
              let toolArgs: Record<string, any> = {};
              try {
                toolArgs = JSON.parse(toolCall.function.arguments || "{}");
              } catch { /* empty args */ }

              const matchedTool = agentTools.find(
                (t) => (t.function_def?.name || t.name) === toolName
              );

              let toolResult: string;
              if (matchedTool) {
                const isInventoryTool = matchedTool.tool_type === "inventory_query";
                const isFipeTool = matchedTool.tool_type === "fipe_query";

                // Block inventory_query when FIPE was already intercepted (appraisal context)
                if (isInventoryTool && fipeIntercepted) {
                  console.log(`[Dispatcher] BLOCKING inventory_query — FIPE was already intercepted for appraisal context`);
                  debugTrace.push({ type: "dispatcher_tool_skipped", tool: toolName, reason: "fipe_intercepted_blocks_inventory", timestamp: Date.now() });
                  currentDispatchMessages.push({
                    role: "tool", tool_call_id: toolCall.id,
                    content: JSON.stringify({ skipped: true, reason: "User asked about FIPE/appraisal for THEIR car, not dealer stock." }),
                  });
                  continue;
                }

                // Block duplicate fipe_query if already intercepted
                if (isFipeTool && fipeIntercepted) {
                  console.log(`[Dispatcher] BLOCKING duplicate fipe_query — already intercepted`);
                  currentDispatchMessages.push({
                    role: "tool", tool_call_id: toolCall.id,
                    content: JSON.stringify({ skipped: true, reason: "FIPE already queried in intercept phase." }),
                  });
                  continue;
                }

                if (isInventoryTool) {
                  // === SKIP IF PHOTOS ALREADY SENT FOR THIS VEHICLE ===
                  // Check if assistant already sent photos of this specific vehicle in history
                  const queryVehicle = (toolArgs.modelo || toolArgs.model || toolArgs.search || toolArgs.marca || toolArgs.brand || "").toLowerCase().trim();
                  if (queryVehicle) {
                    const alreadySentPhotos = messages.some((m: any) => {
                      if (m.role !== "assistant" || !m.content) return false;
                      const hasPhotos = /!\[.*?\]\(https?:\/\//.test(m.content) || /\[foto já enviada anteriormente\]/.test(m.content);
                      if (!hasPhotos) return false;
                      const normalizedContent = m.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      const queryTokens = queryVehicle.split(/\s+/).filter((t: string) => t.length >= 3);
                      const matchCount = queryTokens.filter((t: string) => normalizedContent.includes(t)).length;
                      return matchCount >= Math.max(1, queryTokens.length * 0.5);
                    });

                    if (alreadySentPhotos) {
                      console.log(`[Dispatcher] Skipping redundant inventory_query for "${queryVehicle}" — photos already sent in history`);
                      debugTrace.push({
                        type: "dispatcher_tool_skipped",
                        tool: toolName,
                        reason: "photos_already_sent_for_vehicle",
                        vehicle: queryVehicle,
                        args: toolArgs,
                        timestamp: Date.now(),
                      });
                      // Return empty result so dispatcher loop continues
                      currentDispatchMessages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify({ skipped: true, reason: "Photos for this vehicle were already sent. Do not query again." }),
                      });
                      continue;
                    }
                  }

                  // === CONTEXT VALIDATION: Ensure dispatcher queried the RIGHT vehicle ===
                  // ONLY override if dispatcher's args look like garbage AND context has a KNOWN model
                  const userMentionsExplicitVehicle = /(chevrolet|toyota|honda|hyundai|volkswagen|fiat|ford|bmw|mercedes|audi|nissan|renault|jeep|haval|gwm|peugeot|citroen|mitsubishi|kia|subaru|volvo|porsche|onix|hb20|corolla|civic|creta|tracker|nivus|kicks|polo|virtus|compass|renegade|hilux|s10|ranger|amarok|toro|strada|saveiro|cruze|cobalt|prisma|argo|mobi|kwid|gol|fit|city|sentra|jetta|tucson|sportage|duster|captur|ecosport|bronco|equinox|trailblazer|jolion|territory|haval|q\d|a\d|x\d|c\d{2,3}|gl[abces]\d{2,3})/i.test(latestUserText || "");
                  
                  if (!userMentionsExplicitVehicle) {
                    const contextVehicle = extractVehicleFromContext(latestUserText, messages);
                    if (contextVehicle) {
                      const dispatcherSearch = (toolArgs.modelo || toolArgs.model || toolArgs.marca || toolArgs.brand || toolArgs.search || "").toLowerCase().trim();
                      const contextSearch = (contextVehicle.search || contextVehicle.modelo || contextVehicle.model || "").toLowerCase().trim();
                      
                      // Only override if context search looks like a REAL vehicle term (not garbage)
                      const contextLooksLikeVehicle = /^[a-z0-9\s./-]{1,30}$/.test(contextSearch) && 
                        !/\b(entrar|nosso|nossa|outra|hora|vez|fala|disse|voce|ainda|agora|depois|antes|carro|veiculo|estoque|patio|loja)\b/i.test(contextSearch);
                      
                      // Only override if dispatcher's search is ALSO not a known model code
                      const dispatcherHasKnownModel = /\b(q[0-9]|a[0-9]|x[0-9]|c\d{2,3}|gl[abces]\d{2,3}|onix|hb20|corolla|civic|creta|tracker|nivus|kicks|polo|virtus|hilux|s10|ranger|amarok|toro|strada|compass|renegade)\b/i.test(dispatcherSearch);
                      
                      if (!dispatcherHasKnownModel && contextLooksLikeVehicle && dispatcherSearch && contextSearch && !dispatcherSearch.includes(contextSearch) && !contextSearch.includes(dispatcherSearch)) {
                        console.warn(`[Dispatcher] CONTEXT MISMATCH! Dispatcher wants "${dispatcherSearch}" but conversation context is about "${contextSearch}". Overriding.`);
                        debugTrace.push({
                          type: "dispatcher_context_override",
                          original_args: { ...toolArgs },
                          corrected_search: contextSearch,
                          reason: "dispatcher_queried_wrong_vehicle",
                          timestamp: Date.now(),
                        });
                        toolArgs = { ...toolArgs, search: contextSearch };
                      } else if (!contextLooksLikeVehicle) {
                        console.log(`[Dispatcher] Context extraction returned garbage "${contextSearch}" — keeping dispatcher's original args "${dispatcherSearch}"`);
                      }
                    }
                  }

                  // === ARGUMENT SANITIZATION: block low-signal generic searches ===
                  // Example bad args: { search: "disponivel no estoque" }
                  const normalizedSearchArg = String(
                    toolArgs?.search || toolArgs?.query || toolArgs?.termo || ""
                  )
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9\s]/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                  const genericSearchPattern = /^(disponivel( no estoque)?|em estoque|no estoque|estoque|tem disponivel|tem em estoque|disponibilidade|tem|quero|veiculo|veiculos|carro|carros)$/i;
                  const hasModelCode = /\b[a-z]{1,3}\s?\d{1,4}[a-z0-9-]*\b/i.test(normalizedSearchArg);
                  const hasBrandWord = /(audi|toyota|honda|hyundai|chevrolet|fiat|ford|bmw|mercedes|nissan|renault|jeep|haval|gwm|peugeot|citroen|mitsubishi|kia|subaru|volvo|porsche|land rover|jaguar)/i.test(normalizedSearchArg);
                  const hasSpecificVehicleSignalInArgs = !!(
                    toolArgs?.brand || toolArgs?.marca ||
                    toolArgs?.model || toolArgs?.modelo ||
                    (normalizedSearchArg && (hasModelCode || hasBrandWord || normalizedSearchArg.split(" ").length >= 2) && !genericSearchPattern.test(normalizedSearchArg))
                  );

                  const userHasExplicitVehicleMention = /(audi|toyota|honda|hyundai|chevrolet|fiat|ford|bmw|mercedes|nissan|renault|jeep|haval|gwm|peugeot|citroen|mitsubishi|kia|subaru|volvo|porsche|onix|hb20|corolla|civic|creta|tracker|nivus|kicks|polo|virtus|compass|renegade|hilux|s10|ranger|amarok|toro|strada|saveiro|q\s?\d|a\s?\d|x\s?\d|c\s?\d{2,3}|gl[abces]?\s?\d{2,3})/i.test(latestUserText || "");
                  let skipWeakInventoryCall = false;

                  if (genericSearchPattern.test(normalizedSearchArg) || (userHasExplicitVehicleMention && !hasSpecificVehicleSignalInArgs)) {
                    const recentUserContext = buildRecentUserContextText(messages, 5);
                    const correctedArgs = buildFallbackInventoryArgs(`${recentUserContext} ${latestUserText || ""}`.trim(), messages);
                    if (correctedArgs && Object.keys(correctedArgs).length > 0) {
                      console.warn(`[Dispatcher] Sanitizing weak inventory args. Original=${JSON.stringify(toolArgs)} Corrected=${JSON.stringify(correctedArgs)}`);
                      debugTrace.push({
                        type: "dispatcher_args_sanitized",
                        original_args: { ...toolArgs },
                        corrected_args: correctedArgs,
                        reason: genericSearchPattern.test(normalizedSearchArg)
                          ? "generic_search_term"
                          : "explicit_vehicle_missing_in_args",
                        timestamp: Date.now(),
                      });
                      toolArgs = correctedArgs;
                    } else if (genericSearchPattern.test(normalizedSearchArg)) {
                      console.warn(`[Dispatcher] Skipping weak generic inventory args without recoverable context. Original=${JSON.stringify(toolArgs)}`);
                      debugTrace.push({
                        type: "dispatcher_tool_skipped",
                        tool: toolName,
                        reason: "weak_generic_inventory_args_no_context",
                        args: toolArgs,
                        timestamp: Date.now(),
                      });
                      skipWeakInventoryCall = true;
                    }
                  }

                  if (skipWeakInventoryCall) {
                    currentDispatchMessages.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: JSON.stringify({ skipped: true, reason: "Weak generic inventory args without recoverable vehicle context" }),
                    });
                    continue;
                  }

                  const hasTipoVeiculo = !!(toolArgs?.tipo_veiculo || toolArgs?.vehicle_type);
                  const hasConcreteFilter = !!(
                    toolArgs?.brand || toolArgs?.marca ||
                    toolArgs?.model || toolArgs?.modelo ||
                    toolArgs?.year || toolArgs?.ano ||
                    toolArgs?.min_price || toolArgs?.max_price || toolArgs?.preco_min || toolArgs?.preco_max ||
                    toolArgs?.color || toolArgs?.cor ||
                    toolArgs?.fuel || toolArgs?.fuel_type || toolArgs?.combustivel ||
                    toolArgs?.transmission || toolArgs?.cambio ||
                    toolArgs?.search || toolArgs?.query || toolArgs?.termo
                  );

                  const consultativeOnlyPattern = /(modelo mais alto|carro mais alto|gosto de modelo|quero algo|prefiro|confort[áa]vel)/i;
                  const isConsultativeOnlyMessage = consultativeOnlyPattern.test(latestUserText || "");

                  if (hasTipoVeiculo && !hasConcreteFilter && isConsultativeOnlyMessage) {
                    console.log("[Dispatcher] Skipping inventory_query: consultative message with only tipo_veiculo");
                    debugTrace.push({
                      type: "dispatcher_tool_skipped",
                      tool: toolName,
                      reason: "consultative_message_insufficient_filters",
                      args: toolArgs,
                      latest_user_text: String(latestUserText || "").slice(0, 120),
                      timestamp: Date.now(),
                    });
                    continue;
                  }
                }

                console.log(`[Dispatcher] Executing: ${toolName} (${matchedTool.tool_type})`);
                debugTrace.push({ type: "tool_call", tool: toolName, tool_type: matchedTool.tool_type, args: toolArgs, timestamp: Date.now() });
                toolResult = await executeTool(matchedTool, toolArgs, supabase, agent_id, latestUserText);

                let resultPreview: any = {};
                try {
                  const parsed = JSON.parse(toolResult);
                  resultPreview = { total: parsed.total, vehicle_count: parsed.vehicles?.length, hint: parsed._hint, error: parsed.error, message: parsed.message };
                } catch {
                  resultPreview = { raw_length: toolResult.length };
                }
                debugTrace.push({ type: "tool_result", tool: toolName, preview: resultPreview, timestamp: Date.now() });

                // Collect tool results to inject into conversational context
                toolResultsContext.push(`[Resultado da ferramenta "${toolName}"]: ${toolResult}`);
              } else {
                toolResult = JSON.stringify({ error: `Tool '${toolName}' not found` });
                debugTrace.push({ type: "tool_error", tool: toolName, error: "Tool not found" });
              }

              currentDispatchMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: toolResult,
              });

              // Save tool result to memory
              if (convId) {
                try {
                  await supabase.rpc("save_message", {
                    p_agent_id: agent_id,
                    p_conversation_id: convId,
                    p_role: "tool",
                    p_content: toolResult,
                    p_model: null,
                    p_tokens_input: 0,
                    p_tokens_output: 0,
                    p_latency_ms: null,
                    p_metadata: null,
                  });
                } catch {}
              }
            }

            // Continue loop in case dispatcher wants to call more tools based on results
          }
        } catch (e: any) {
          console.error("[Dispatcher] Fatal error:", e);
          debugTrace.push({ type: "dispatcher_error", error: e.message, timestamp: Date.now() });
          // Continue — conversational LLM will respond without tool data
        }
        } // close else (provider loaded successfully)
        } // close contestation else block
      } // close else (dispatcherProviderId exists)

      // ===== VEHICLE MENTION FALLBACK (ANTI-HALLUCINATION SAFETY NET) =====
      // If user mentions ANY vehicle brand/model/category/price OR asks about availability
      // but the dispatcher didn't call inventory_query, FORCE the call.
      // CRITICAL: Do NOT force when user is contesting, reacting to, or selecting from previous response.
      const vehicleMentionPattern = /(audi|toyota|honda|hyundai|chevrolet|fiat|ford|bmw|mercedes|nissan|renault|jeep|haval|gwm|peugeot|citroen|mitsubishi|kia|subaru|volvo|porsche|land rover|jaguar|ram|dodge|caoa|chery|byd|onix|hb20|corolla|civic|creta|tracker|nivus|kicks|polo|virtus|compass|renegade|hilux|s10|ranger|amarok|toro|strada|saveiro|cruze|cobalt|prisma|argo|mobi|kwid|gol|fit|city|sentra|jetta|tucson|sportage|duster|captur|ecosport|bronco|equinox|trailblazer|jolion|territory|q\s?\d|a\s?\d|x\s?\d|serie\s?\d|classe\s?[a-e]|suv|sedan|hatch|picape|caminhonete|camionete)/i;
      const priceAvailabilityPattern = /(tem |temos|disponivel|disponível|estoque|qual valor|quanto custa|qual preço|qual preco|em qual|faixa de preço|faixa de preco|até \d|ate \d)/i;
      const photoFallbackPattern = /(manda foto|envia foto|pode enviar|enviar fotos|ver foto|ver imagem|mostra foto|mostra imagem|quero foto|quero ver|me manda|me envia)/i;

      // Detect contestation/reaction patterns to BLOCK the fallback
      const fallbackContestationPattern = /\b(uma hora|outra hora|voce fala|voce disse|voce falou|me mandou|contradiz|ta errado|incorreto|errada|errado|confusao|confusa|confuso|insistencia|denovo|de novo|nao entendi|afinal)\b/i;
      const isContestationForFallback = fallbackContestationPattern.test(latestUserText || "");

      // Detect appraisal/FIPE context — user is talking about THEIR OWN car, NOT dealer stock
      const normalizedUserForAppraisal = (latestUserText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isAppraisalContext = /(meu carro|meu veiculo|minha |tenho um|tenho uma|fipe|tabela fipe|valor da fipe|avaliar|avaliacao|pre.?avaliacao|quero trocar|dar na troca|dar como entrada|quero vender|meu .{2,20} vale)/i.test(normalizedUserForAppraisal);

      const userMentionsVehicle = vehicleMentionPattern.test(latestUserText || "");
      const userAsksAboutAvailability = priceAvailabilityPattern.test(latestUserText || "");
      const userAskedForPhotos = photoFallbackPattern.test(latestUserText || "");
      const userSelectingPreviousOption = isUserSelectingPreviousOption(latestUserText || "");
      const dispatcherAlreadyQueriedInventory = toolResultsContext.some(r => r.includes('"total"'));
      const hasInventoryToolForFallback = agentTools.some(t => t.tool_type === "inventory_query");

      const shouldForceFallback = hasInventoryToolForFallback
        && !dispatcherAlreadyQueriedInventory
        && !userSelectingPreviousOption
        && !isContestationForFallback
        && !isAppraisalContext  // DO NOT force inventory when user is asking about THEIR car/FIPE
        && (userMentionsVehicle || userAsksAboutAvailability || userAskedForPhotos);

      if (isAppraisalContext && !dispatcherAlreadyQueriedInventory) {
        console.log(`[VehicleFallback] BLOCKED — appraisal/FIPE context detected, skipping inventory fallback: "${(latestUserText || "").slice(0, 80)}"`);
        debugTrace.push({ type: "vehicle_fallback_blocked", reason: "appraisal_context_detected", user_text: (latestUserText || "").slice(0, 120), timestamp: Date.now() });
      }

      if (isContestationForFallback && !dispatcherAlreadyQueriedInventory) {
        console.log(`[VehicleFallback] BLOCKED — user is contesting/reacting, not requesting new data: "${(latestUserText || "").slice(0, 80)}"`);
        debugTrace.push({ type: "vehicle_fallback_blocked", reason: "contestation_detected", user_text: (latestUserText || "").slice(0, 120), timestamp: Date.now() });
      }

      if (shouldForceFallback) {
        const fallbackReason = userMentionsVehicle ? "vehicle_mention" : userAsksAboutAvailability ? "availability_question" : "photo_request";
        console.log(`[VehicleFallback] Dispatcher did NOT call inventory but user ${fallbackReason} detected — FORCING inventory_query`);
        debugTrace.push({ type: "vehicle_fallback_triggered", reason: fallbackReason, user_text: (latestUserText || "").slice(0, 120), timestamp: Date.now() });

        const inventoryTool = agentTools.find(t => t.tool_type === "inventory_query")!;

        // Build fallback args from latest + recent user context
        const recentUserContext = buildRecentUserContextText(messages, 5);
        const fallbackArgs = buildFallbackInventoryArgs(`${recentUserContext} ${latestUserText || ""}`.trim(), messages);
        console.log(`[VehicleFallback] Extracted filters: ${JSON.stringify(fallbackArgs)}`);
        debugTrace.push({ type: "vehicle_fallback_filters", filters: fallbackArgs, timestamp: Date.now() });

        if (Object.keys(fallbackArgs).length > 0) {
          try {
            const fallbackResult = await executeTool(inventoryTool, fallbackArgs, supabase, agent_id, latestUserText);
            toolResultsContext.push(`[Resultado da ferramenta "consultar_estoque"]: ${fallbackResult}`);
            console.log(`[VehicleFallback] Inventory query returned results`);
            debugTrace.push({ type: "vehicle_fallback_result", result_length: fallbackResult.length, timestamp: Date.now() });
          } catch (e: any) {
            console.error("[VehicleFallback] Error:", e.message);
          }
        }
      }

      // ===== FIPE APPRAISAL FALLBACK =====
      // When conversation is in appraisal mode (customer's OWN vehicle for trade-in)
      // and we have brand+model+year from context but fipe_query was never called, force it.
      const hasFipeTool = agentTools.some(t => t.tool_type === "fipe_query");
      const dispatcherAlreadyQueriedFipe = toolResultsContext.some(r => /fipe|tabela fipe|preco_medio|valor_medio|fipe_query/i.test(r));
      
      if (hasFipeTool && !dispatcherAlreadyQueriedFipe) {
        // Check if conversation is in appraisal mode by scanning history
        const fullHistory = messages.map((m: any) => String(m.content || "").toLowerCase()).join(" ");
        const isAppraisalMode = /(pre.?avalia|avalia|troca|meu carro|meu veiculo|meu ve[ií]culo|quero vender|quero trocar|carro pra trocar|pra troca|na troca|dar como entrada|dar na troca|quilometr|km rodad|unico dono|único dono)/.test(
          fullHistory.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );

        if (isAppraisalMode) {
          // Check if FIPE was already consulted in any previous assistant message
          const fipeAlreadyInHistory = messages.some((m: any) => 
            m.role === "assistant" && /\b(tabela fipe|valor fipe|pre.o.*(fipe|mercado)|fipe.*(refer|tabela)|r\$\s*[\d.,]+.*fipe|estimativa.*fipe)\b/i.test(String(m.content || ""))
          );

          if (!fipeAlreadyInHistory) {
            // Extract brand/model/year from conversation context for the CUSTOMER'S vehicle
            const appraisalVehiclePattern = /(tenho|meu|possuo|vou dar|dar na troca|trocar|avaliar|pra troca)\s+(?:um |uma |o |a )?([\w\s/-]+?)(?:\s+(\d{4}))?(?:\s|$|,|\.|!|\?)/i;
            // Also try to find standalone brand+model mentions in the context
            const knownBrandsForFipe = ["chevrolet", "toyota", "honda", "hyundai", "volkswagen", "fiat", "ford", "jeep", "nissan", "renault", "mitsubishi", "kia", "peugeot", "citroen", "bmw", "mercedes", "audi", "volvo", "subaru", "suzuki"];
            
            let fipeMarca = "";
            let fipeModelo = "";
            let fipeAno = 0;

            // Scan messages for vehicle info
            for (const msg of messages) {
              const text = String(msg.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              
              // Extract year
              const yearMatch = text.match(/\b(20[0-2]\d|19[89]\d)\b/);
              if (yearMatch && !fipeAno) fipeAno = parseInt(yearMatch[1]);
              
              // Extract brand
              for (const brand of knownBrandsForFipe) {
                if (text.includes(brand) && !fipeMarca) {
                  fipeMarca = brand;
                  break;
                }
              }
              
              // Extract model from context: look for known models
              const knownModelsForFipe = ["cruze", "onix", "tracker", "spin", "cobalt", "prisma", "s10", "corolla", "civic", "hb20", "creta", "tucson", "compass", "renegade", "polo", "virtus", "gol", "hilux", "ranger", "toro", "argo", "mobi", "kicks", "nivus", "t-cross", "tcross", "fit", "city", "hr-v", "hrv", "duster", "captur", "sentra", "jetta", "amarok", "strada", "saveiro"];
              for (const model of knownModelsForFipe) {
                if (text.includes(model) && !fipeModelo) {
                  fipeModelo = model;
                  break;
                }
              }
            }

            if (fipeMarca && fipeModelo) {
              console.log(`[FipeAppraisalFallback] Appraisal mode detected with vehicle: ${fipeMarca} ${fipeModelo} ${fipeAno || "?"} — forcing fipe_query`);
              debugTrace.push({
                type: "fipe_appraisal_fallback",
                marca: fipeMarca,
                modelo: fipeModelo,
                ano: fipeAno || null,
                timestamp: Date.now(),
              });

              const fipeTool = agentTools.find(t => t.tool_type === "fipe_query")!;
              const fipeArgs: Record<string, any> = { marca: fipeMarca, modelo: fipeModelo };
              if (fipeAno) fipeArgs.ano = fipeAno;

              try {
                const fipeResult = await executeTool(fipeTool, fipeArgs, supabase, agent_id, latestUserText);
                toolResultsContext.push(`[Resultado da ferramenta "consultar_fipe"]: ${fipeResult}`);
                console.log(`[FipeAppraisalFallback] FIPE query returned results`);
                debugTrace.push({ type: "fipe_appraisal_result", result_length: fipeResult.length, timestamp: Date.now() });

                // Save tool result to memory
                if (convId) {
                  try {
                    await supabase.rpc("save_message", {
                      p_agent_id: agent_id,
                      p_conversation_id: convId,
                      p_role: "tool",
                      p_content: fipeResult,
                      p_model: null,
                      p_tokens_input: 0,
                      p_tokens_output: 0,
                      p_latency_ms: null,
                      p_metadata: null,
                    });
                  } catch {}
                }
              } catch (e: any) {
                console.error("[FipeAppraisalFallback] Error:", e.message);
              }
            } else {
              console.log(`[FipeAppraisalFallback] Appraisal mode but insufficient vehicle data: marca="${fipeMarca}" modelo="${fipeModelo}" ano=${fipeAno}`);
            }
          } else {
            console.log("[FipeAppraisalFallback] FIPE already consulted in history — skipping");
          }
        }
      }
    } // close if (openaiTools)

    // ===== PHASE 2: CONVERSATIONAL LLM =====
    // Build final messages WITH tool data injected as system context (no tool calling needed)
    // Strip photo URLs from history AND remove historical tool/system messages that contain
    // inventory data from PREVIOUS turns — they pollute context and cause repetition
    const conversationalMessages = fullMessages
      .filter((msg: any) => {
        // Remove historical "system" messages that are actually old tool results
        // (they contain JSON with "total", "_hint", "vehicles" etc.)
        if (msg.role === "system" && msg.content && /\[Resultado da ferramenta/.test(msg.content)) return false;
        if (msg.role === "system" && msg.content && /"_hint"/.test(msg.content) && /"vehicles"/.test(msg.content)) return false;
        // Also filter system messages containing raw inventory JSON from previous turns
        if (msg.role === "system" && msg.content && /"total"\s*:\s*\d/.test(msg.content) && /"vehicles"\s*:/.test(msg.content)) return false;
        return true;
      })
      .map((msg: any) => {
        if (msg.role === "assistant" && msg.content && hasMarkdownImages(msg.content)) {
          return { ...msg, content: msg.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, "[foto já enviada]") };
        }
        return msg;
      });

    const userSelectingPreviousOptionForPhase2 = isUserSelectingPreviousOption(latestUserText || "");

    // If the customer is selecting an option already presented, force continuity and block contradictions.
    if (userSelectingPreviousOptionForPhase2 && toolResultsContext.length === 0) {
      const continuityMsg = `⚠️ CONTINUIDADE DE CONTEXTO (PRIORIDADE MÁXIMA):
O cliente está escolhendo uma opção JÁ apresentada anteriormente nesta conversa.
NÃO contradiga a disponibilidade já apresentada.
NÃO diga que "não tem" ou "não encontramos" nesta resposta.
Aja com continuidade comercial: confirme a opção escolhida e avance com próximos passos (detalhes, fotos, visita, proposta).`;
      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx > 0) {
        conversationalMessages.splice(lastUserIdx, 0, { role: "system", content: continuityMsg });
      } else {
        conversationalMessages.splice(1, 0, { role: "system", content: continuityMsg });
      }
      debugTrace.push({ type: "continuity_guard_injected", reason: "user_selected_previous_option", timestamp: Date.now() });
      console.log("[Conversational] Injected continuity guard for previous-option selection");
    }

    if (toolResultsContext.length > 0) {
      // Check if ALL tool results returned zero vehicles
      const allToolsReturnedEmpty = toolResultsContext.every(ctx => {
        try {
          const cleaned = ctx.replace(/^\[Resultado da ferramenta "[^"]+"\]: /, "");
          const parsed = JSON.parse(cleaned);
          return parsed?.total === 0 || (parsed?.message && /nenhum/i.test(parsed.message));
        } catch { return false; }
      });

      let toolContextMsg: string;
      if (allToolsReturnedEmpty) {
        // ANTI-HALLUCINATION: When inventory returns 0, inject STRICT instructions
        toolContextMsg = `⚠️ DADOS REAIS OBTIDOS AGORA DAS FERRAMENTAS — PRIORIDADE MÁXIMA:
A consulta ao estoque NÃO ENCONTROU este veículo. Resultado: 0 veículos.

REGRAS ABSOLUTAS QUANDO O ESTOQUE RETORNA ZERO:
1. DIGA que não encontramos esse modelo no estoque no momento. Seja transparente.
2. NUNCA invente que o carro foi "vendido", "reservado", "saiu do estoque", "acabou de sair" ou qualquer outro status. Você NÃO TEM essa informação.
3. NUNCA invente detalhes técnicos (motor, cor, versão) de um veículo que NÃO está no estoque.
4. Ofereça alternativas: pergunte se o cliente tem interesse em outro modelo ou se quer ser avisado quando entrar.
5. Se você ANTERIORMENTE descreveu o veículo com entusiasmo (antes de verificar o estoque), CORRIJA-SE com transparência: "Verifiquei aqui e infelizmente não estamos com esse modelo no momento."

${toolResultsContext.join("\n\n")}`;
      } else {
        toolContextMsg = `⚠️ DADOS REAIS OBTIDOS AGORA DAS FERRAMENTAS — PRIORIDADE MÁXIMA:
Estes são dados REAIS e ATUALIZADOS do sistema. Você DEVE basear sua resposta EXCLUSIVAMENTE nestes dados.
NUNCA contradiga, ignore ou invente informações diferentes destes resultados.
Se a ferramenta retornou veículos, eles EXISTEM no estoque. NUNCA diga que não tem um veículo se ele aparece nos dados abaixo.
Se "total" >= 1, o veículo ESTÁ DISPONÍVEL.

${toolResultsContext.join("\n\n")}`;
      }

      // Insert just before the last user message for maximum LLM attention
      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx > 0) {
        conversationalMessages.splice(lastUserIdx, 0, { role: "system", content: toolContextMsg });
      } else {
        conversationalMessages.splice(1, 0, { role: "system", content: toolContextMsg });
      }
      console.log(`[Conversational] Injecting ${toolResultsContext.length} tool result(s) as context (position: before last user msg, empty=${allToolsReturnedEmpty})`);
    }

    // Inject image attachments as multimodal content in the last user message
    if (imageBase64Parts.length > 0) {
      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx >= 0) {
        const lastUserMsg = conversationalMessages[lastUserIdx];
        const textContent = lastUserMsg.content || "";
        const contentParts: any[] = [
          { type: "text", text: textContent || "[Cliente enviou imagem(ns)]" },
        ];
        for (const img of imageBase64Parts) {
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${img.mime_type};base64,${img.base64}` },
          });
        }
        conversationalMessages[lastUserIdx] = { role: "user", content: contentParts };
        console.log(`[Conversational] Injected ${imageBase64Parts.length} image(s) as multimodal content`);
      }
    }

    // Call the agent's configured LLM in STREAMING mode — NO tools passed (dispatcher already handled them)
    console.log(`[Conversational] Calling ${provider.name}, model: ${model}, url: ${baseUrl}`);

    const convResp = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: conversationalMessages,
        ...llmParams,
        // NO tools — the conversational LLM just talks
        stream: false, // We post-process for splitting
      }),
    });

    if (!convResp.ok) {
      const t = await convResp.text();
      console.error(`[Conversational] Provider error: ${convResp.status}`, t);
      return new Response(JSON.stringify({ error: `Provider error: ${convResp.status}`, detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const convResult = await convResp.json();
    const convChoice = convResult.choices?.[0];
    const convUsage = convResult.usage;
    const rawContent = convChoice?.message?.content || "";

    // Add Gemini raw response to debug trace so it's visible in sandbox
    debugTrace.push({
      type: "gemini_response",
      phase: "conversational",
      model,
      raw_content: rawContent.slice(0, 500),
      full_length: rawContent.length,
      timestamp: Date.now(),
    });
    console.log(`[Conversational] Gemini raw response (${rawContent.length} chars): ${rawContent.slice(0, 200)}`);

    if (convUsage) {
      console.log(`[Conversational] Tokens: prompt=${convUsage.prompt_tokens}, completion=${convUsage.completion_tokens}, total=${convUsage.total_tokens}`);
      debugTrace.push({
        type: "token_usage",
        phase: "conversational",
        model,
        provider: provider.name,
        prompt_tokens: convUsage.prompt_tokens,
        completion_tokens: convUsage.completion_tokens,
        total_tokens: convUsage.total_tokens,
        timestamp: Date.now(),
      });
      // Record conversational usage event
      const convLatency = Date.now() - startTime;
      recordUsageEvent(supabaseAdmin, {
        tenant_id: agent.tenant_id,
        agent_id: agent_id,
        conversation_id: convId,
        provider: provider.name,
        model,
        prompt_tokens: convUsage.prompt_tokens || 0,
        completion_tokens: convUsage.completion_tokens || 0,
        latency_ms: convLatency,
        tool_calls_count: 0,
        phase: "conversational",
      });
    }

    let finalContent = sanitizeLLMOutput(rawContent);

    // FALLBACK: if LLM returned empty response, provide a sensible default
    if (!finalContent.trim()) {
      console.warn("[Conversational] LLM returned EMPTY response — applying fallback");
      debugTrace.push({ type: "empty_response_fallback", model, timestamp: Date.now() });

      // Check if there were image attachments — the empty response is likely due to multimodal issues
      if (imageBase64Parts.length > 0) {
        finalContent = "Recebi sua foto! Vou analisar aqui. Me dá um momento que já te retorno.";
      } else {
        finalContent = "Desculpa, não consegui processar sua mensagem agora. Pode repetir?";
      }
    }

    finalContent = dedupeRepeatedParagraphs(finalContent);
    finalContent = removeRedundantPhotoOfferWhenPhotosPresent(finalContent);

    // GUARD: Detect hallucinated "sold/reserved" claims when inventory returned 0
    const soldPattern = /\b(acabou de ser vendid|foi vendid|foi reservad|saiu do estoque|ultimo.?foi|já foi vendid|acabou.?de sair|não está mais disponível.*vendid|esgotou)\b/i;
    if (soldPattern.test(finalContent)) {
      // Check if any tool result actually confirms the vehicle was sold
      const hasSoldConfirmation = toolResultsContext.some(ctx => /vendido|reservado|indisponível/i.test(ctx));
      if (!hasSoldConfirmation) {
        console.warn("[PostProcess] BLOCKED hallucinated 'sold/reserved' claim — rewriting");
        debugTrace.push({ type: "hallucination_blocked", pattern: "sold_claim", original_snippet: finalContent.slice(0, 200), timestamp: Date.now() });
        // Replace the fabricated sold claim with honest language
        finalContent = finalContent.replace(/[^.!?\n]*\b(acabou de ser vendid|foi vendid|foi reservad|saiu do estoque|ultimo.?foi vendid|já foi vendid|acabou.?de sair)[^.!?\n]*/gi, 
          "Verifiquei aqui e não estamos com esse modelo no estoque no momento");
        finalContent = finalContent.replace(/\n{3,}/g, "\n\n").trim();
      }
    }

    // Inject missing photos: if tool results contain vehicles with photos, ensure they appear in content
    // BUT NOT when user sent images (appraisal flow — they sent THEIR car photos, don't inject dealer photos)
    const isAppraisalPhotoContext = imageBase64Parts.length > 0 && !(latestUserText || "").trim();
    if (toolResultsContext.length > 0 && !isAppraisalPhotoContext) {
      try {
        for (const ctx of toolResultsContext) {
          const parsed = JSON.parse(ctx.replace(/^\[Resultado da ferramenta "[^"]+"\]: /, ""));
          if (parsed?.vehicles && Array.isArray(parsed.vehicles)) {
            finalContent = appendMissingVehiclePhotos(finalContent, parsed.vehicles, latestUserText, true);
            console.log(`[PostProcess] appendMissingVehiclePhotos applied, vehicles=${parsed.vehicles.length}`);
          }
        }
      } catch (e: any) {
        console.warn("[PostProcess] Could not extract vehicles for photo injection:", e?.message);
      }
    } else if (isAppraisalPhotoContext && toolResultsContext.length > 0) {
      console.log(`[PostProcess] Skipping photo injection — appraisal context (user sent image, no text)`);
    }

    // Guard: strip premature closing questions (scheduling, simulation, visit) when photos are being sent
    if (hasMarkdownImages(finalContent)) {
      const paragraphs = finalContent.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
      const filtered = paragraphs.filter((p: string) => {
        const norm = p.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Remove paragraphs that are closing/scheduling questions when photos are present
        const isSchedulingClose = /(agendar|visita|test.?drive|simula[çc][aã]o|financiamento|quer (saber|conhecer|vir|ver presencial)|vamos marcar|bora marca|que tal)/.test(norm)
          && /\?/.test(norm)
          && p.length < 250;
        return !isSchedulingClose;
      });
      if (filtered.length < paragraphs.length) {
        const removed = paragraphs.length - filtered.length;
        console.log(`[PostProcess] Stripped ${removed} premature closing question(s) — photos present`);
        debugTrace.push({ type: "closing_question_stripped", removed_count: removed, reason: "photos_present", timestamp: Date.now() });
        finalContent = filtered.join("\n\n").trim();
      }
    }

    // Guard: when dispatcher DID fetch tool data, only allow photo URLs that appear in the tool results.
    // This prevents the LLM from re-sending photos of previously discussed vehicles.
    if (toolResultsContext.length > 0 && hasMarkdownImages(finalContent)) {
      const allowedUrls = new Set<string>();
      for (const ctx of toolResultsContext) {
        // Extract all URLs from tool result JSON
        const urlMatches = ctx.matchAll(/https?:\/\/[^\s"',\]})]+\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)[^\s"',\]})']*/gi);
        for (const m of urlMatches) {
          allowedUrls.add(cleanPhotoUrl(m[0]));
        }
      }

      if (allowedUrls.size > 0) {
        let strippedCount = 0;
        finalContent = finalContent.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, (full, rawUrl: string) => {
          const cleaned = cleanPhotoUrl(rawUrl || "");
          if (!allowedUrls.has(cleaned)) {
            strippedCount++;
            return "";
          }
          return full;
        });
        if (strippedCount > 0) {
          console.log(`[Conversational] Stripped ${strippedCount} photo(s) not in current tool results (anti-crossover)`);
          debugTrace.push({ type: "photo_crossover_strip", removed_count: strippedCount, allowed_count: allowedUrls.size, timestamp: Date.now() });
          finalContent = finalContent.replace(/\n{3,}/g, "\n\n").trim();
        }
      }
    }

    // Guard: when dispatcher did NOT call any tool, NEVER allow photos in the response.
    // The LLM may hallucinate or pull photos from conversation history.
    if (toolResultsContext.length === 0 && finalContent && hasMarkdownImages(finalContent)) {
      let strippedCount = 0;
      finalContent = finalContent.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, () => {
        strippedCount++;
        return "";
      });
      finalContent = finalContent.replace(/\n{3,}/g, "\n\n").trim();
      if (strippedCount > 0) {
        console.log(`[Conversational] Stripped ALL ${strippedCount} photo(s) — no tool was called, photos not allowed`);
        debugTrace.push({
          type: "photo_strip_no_tool",
          removed_count: strippedCount,
          reason: "no_tools_called",
          timestamp: Date.now(),
        });
      }
    }

    // Save to memory — split into separate messages to match WhatsApp delivery
    const messageParts = splitIntoMessages(finalContent);
    if (convId && finalContent) {
      const latency = Date.now() - startTime;
      try {
        for (let i = 0; i < messageParts.length; i++) {
          await supabase.rpc("save_message", {
            p_agent_id: agent_id, p_conversation_id: convId,
            p_role: "assistant", p_content: messageParts[i], p_model: model,
            p_latency_ms: i === 0 ? latency : null,
            p_metadata: i === 0 ? { debug: debugTrace, edge_logs: collectedLogs } : null,
          });
        }
      } catch (e: any) { console.warn("Could not save assistant msg:", e); }
    }

    // Stream-simulate the final response for the frontend
    // messageParts already computed above for save_message
    debugTrace.push({
      type: "llm_transform",
      raw_length: rawContent.length,
      sanitized_length: sanitizeLLMOutput(rawContent).length,
      final_length: finalContent.length,
      parts_count: messageParts.length,
      parts_preview: messageParts.slice(0, 3),
      timestamp: Date.now(),
    });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        if (convId) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ conversation_id: convId })}\n\n`));
        }
        if (debugTrace.length > 0) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ debug: debugTrace })}\n\n`));
        }
        if (collectedLogs.length > 0) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ edge_logs: collectedLogs })}\n\n`));
        }
        // Helper: sleep with ±30% random variation
        const jitteredSleep = (ms: number) => {
          if (ms <= 0) return Promise.resolve();
          const variation = ms * 0.3;
          const actual = Math.round(ms + (Math.random() * 2 - 1) * variation);
          return new Promise((r) => setTimeout(r, Math.max(0, actual)));
        };

        // Initial "reading" delay — simulates the agent reading the message
        if (readDelayMs > 0) {
          await jitteredSleep(readDelayMs);
        }

        for (let partIdx = 0; partIdx < messageParts.length; partIdx++) {
          const part = messageParts[partIdx];

          // "Typing" delay before each block
          if (typingDelayMs > 0) {
            await jitteredSleep(typingDelayMs);
          }

          if (partIdx > 0) {
            const splitEv = { choices: [{ delta: { content: MSG_SPLIT } }] };
            await writer.write(encoder.encode(`data: ${JSON.stringify(splitEv)}\n\n`));

            // Gap between message blocks
            if (blockGapMs > 0) {
              await jitteredSleep(blockGapMs);
            }
          }
          const chunkSize = 20;
          for (let i = 0; i < part.length; i += chunkSize) {
            const chunk = part.slice(i, i + chunkSize);
            const ev = { choices: [{ delta: { content: chunk } }] };
            await writer.write(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          }
        }
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (e) { console.error("stream error:", e); }
      await writer.close();
    })();

    if (convId) {
      try { await supabase.rpc("list_agent_conversations", { p_agent_id: agent_id, p_limit: 1 }); } catch {}
    }

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (err: any) {
    console.error("chat-agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    // Restore original console methods
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
});
