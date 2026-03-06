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

  // CRITICAL: Detect when the ENTIRE response is a JSON action object (Gemini hallucination)
  // e.g.: { "action": "marcar_agendamento", "action_input": "{...}" }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      // If it's a JSON action/tool object, it's not user-facing text
      if (parsed.action || parsed.action_input || parsed.tool || parsed.function || parsed.consultar_estoque || parsed.query) {
        console.warn("[Sanitize] Detected full-JSON action object response — stripping entirely");
        return "";  // Will trigger the empty response fallback which uses the dispatcher hint
      }
    } catch {
      // Not valid JSON, continue with normal sanitization
    }
  }

  // Remove lines like "ENVIAR_FOTOS_VEICULO: ...", "ENVIAR_FOTO: ...", etc.
  text = text.replace(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/gmi, "");
  // Remove HANDOFF_COMERCIAL command lines (should not be visible to client)
  text = text.replace(/^.*HANDOFF_COMERCIAL.*$/gmi, "");
  // Remove other common tool artifact patterns
  text = text.replace(/^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/gmi, "");

  // Remove leaked JSON blocks (tool calls, action objects, query objects)
  text = text.replace(/^\s*\{[\s\S]*?"(action|action_input|modelo|marca|tool|function|query|search|consultar_estoque)"[\s\S]*?\}\s*$/gmi, "");
  text = text.replace(/\{\s*"(action|action_input|modelo|marca|tool_name|function_name|consultar_estoque)"[^}]*\}/gi, "");

  // Remove "Vou verificar/consultar no sistema" + JSON blocks (LLM thinking out loud)
  text = text.replace(/^.*(?:vou (?:verificar|consultar|checar|buscar)|verificando|consultando|buscando).*(?:sistema|estoque|banco).*[:]\s*$/gmi, "");

  // Clean up excessive newlines left behind
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

// Strip ALL emoji characters from text (for tenants that prohibit emoji usage)
function stripEmojis(content: string): string {
  // Remove emoji Unicode ranges: emoticons, symbols, dingbats, transport, misc, flags, etc.
  return content
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")  // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")  // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")  // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")  // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, "")    // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, "")    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")    // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")  // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")  // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")  // Symbols Extended-A
    .replace(/[\u{200D}]/gu, "")             // Zero Width Joiner
    .replace(/[\u{20E3}]/gu, "")             // Combining Enclosing Keycap
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")  // Tags
    .replace(/  +/g, " ")                     // Clean up double spaces left behind
    .trim();
}

// ---------- Contextual photo acceptance detection ----------
// Detects when a short user message is accepting a photo offer from the previous assistant message
function isContextualPhotoAcceptance(userText: string, history: any[]): boolean {
  if (!userText || !history || history.length === 0) return false;
  
  const normalized = userText.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Short acceptance patterns (must be concise — typically 1-3 words)
  const acceptancePattern = /^(quero|sim|pode|manda|claro|por favor|ok|bora|com certeza|gostaria|aceito|positivo|afirmativo|quero sim|pode sim|manda sim|sim por favor|pode me enviar|quero ver|sim quero|manda ai|manda la|envia|envia sim|quero fotos?|sim,?\s*quero|sim,?\s*pode|claro que sim|pode mandar|pode enviar|com certeza|logico|lógico|obvio|óbvio|show|beleza|top|perfeito|isso|isso mesmo|por gentileza|por obsequio|pfv|pf|s|ss|sss|siim|siiim|querooo|queroo|mandaa|mandaaa|cade|cad[eê]|cade\s*\?|cad[eê]\s*\?|e\s+as\s+fotos|e\s+a[ií]\s*\??|vai\s+mandar|nao\s+mandou|n[aã]o\s+mandou|nao\s+enviou|n[aã]o\s+enviou|ta\s+demorando|t[aá]\s+demorando|estou\s+esperando|to\s+esperando)[.!?,\s]*$/i;
  if (!acceptancePattern.test(normalized)) return false;
  
  // Find the last assistant message in history
  let lastAssistantContent = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "assistant" && history[i]?.content) {
      lastAssistantContent = String(history[i].content).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      break;
    }
  }
  
  if (!lastAssistantContent) return false;
  
  // Photo offer patterns in assistant's previous message
  const photoOfferPattern = /(quer|gostaria|posso|vou|deseja|te mand|te envi|te mostr).{0,30}(fotos?|imagens?|ver\s+(ele|ela|o\s+carro|o\s+veiculo|as\s+fotos?))|fotos?\s+(dele|dela|do\s+\w+|da\s+\w+)|mand[aeo]r?\s+fotos?|envi[aeo]r?\s+fotos?|mostrar\s+fotos?|(quer|gostaria)\s+.{0,20}(ver|receber|conferir)/i;
  
  return photoOfferPattern.test(lastAssistantContent);
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

    // Accept explicit image extensions OR common media delivery paths without extension
    const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(?:$|[?#])/i.test(trimmed);
    const looksLikeMediaPath = /(image|images|foto|fotos|photo|photos|attachment|attachments|active_storage|blob|media|upload|cdn)/i.test(`${u.pathname}${u.search}`);

    return hasImageExtension || looksLikeMediaPath;
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
  if (!allPhotos.length) {
    console.warn(`[appendMissingVehiclePhotos] Vehicle without valid photos after normalization: id=${targetVehicle?.id || "n/a"} model=${targetVehicle?.model || "n/a"}`);
    return content;
  }

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

  return /\bfotos?\b|\bimagens?\b|\bdetalhes?\b|\bmais informacoes?\b|\bver\b|\bmostrar\b|\benviar\b|\bmandar\b|\bme\s*mand[ae]r?\b/.test(normalized);
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

// Dead code removed: buildRecentUserContextText, buildFallbackInventoryArgs, extractVehicleFromContext
// All tool dispatch decisions are now made solely by the dispatcher LLM.

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

// Detect when user is selecting/referring to an option already presented by the assistant
function isUserSelectingPreviousOption(text: string): boolean {
  if (text.length > 200) return false;
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  // Exclude questions (ending with ?) — these are confirmations/queries, not selections
  if (normalized.endsWith("?")) return false;
  // Exclude scheduling-related phrases where "esta/esse" is a verb (estar), not a demonstrative
  if (/^est[ae]\s+(agendad|confirmad|marcad|reservad|cancelad|pront|certo)/i.test(normalized)) return false;
  return /^(ess[ae]|est[ae]|quero\s+(ess[ae]|est[ae]|o\s|a\s)|a\s+(primeir|segund|terceir)|o\s+(primeir|segund|terceir)|me\s+(fala|conta|manda|envia|mostra)\s+(mais\s+)?(d[aoe]\s)?(primeir|segund|terceir|ess[ae]|est[ae])|sim\s*,?\s*(ess[ae]|est[ae])|gostei\s+(d[aoe]\s)?(primeir|segund|terceir|ess[ae])|prefiro\s+(ess[ae]|est[ae]|o\s|a\s))/.test(normalized);
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

async function executeTool(tool: ToolDef, args: Record<string, any>, supabase: any, agentId: string, userText?: string, history?: any[], context?: { convId?: string; externalUserId?: string }): Promise<string> {
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

        // Determine if user EXPLICITLY asked for PHOTOS/IMAGES
        // Covers infinitive forms (mandar, enviar, mostrar) AND conjugations (manda, envia, mostra)
        // Also covers contextual requests like "me manda da X tambem" (implying photos from context)
        const photoRequestPattern = /\b(fotos?|imagens?|images?|photos?|mand[ae]r?\s*fotos?|envia(?:r)?\s*fotos?|ver\s*fotos?|ver\s*imagens?|mostra(?:r)?\s*fotos?|mostra(?:r)?\s*imagens?|quero\s*ver\s*fotos?|me\s*envia(?:r)?|me\s*mand[ae]r?|pode\s*me\s*mand[ae]r?|galeria)\b/i;
        // CONTEXTUAL: "me manda/mandar da X tambem" after photos were just sent implies more photos
        const contextualPhotoPattern = /\b(me\s*mand[ae]r?|pode\s*me\s*mand[ae]r?|me\s*envia(?:r)?|pode\s*me\s*envia(?:r)?)\b.*\b(tamb[eé]m|tb|tbm|tamb[eé]n)\b/i;
        const isPhotoRequest = photoRequestPattern.test(userText || "") || contextualPhotoPattern.test(userText || "") || isContextualPhotoAcceptance(userText || "", history || []);
        // Aceite genérico: cliente disse "Sim"/"Quero" etc. MAS não nomeou veículo específico
        const isGenericAcceptance = isContextualPhotoAcceptance(userText || "", history || [])
          && !photoRequestPattern.test(userText || "")
          && !contextualPhotoPattern.test(userText || "")
          && !brandArg && !modelArg && !(args.search || args.query || args.termo);
        // Só ativa modo foto se: pedido específico OU aceite genérico com 1 veículo (sem ambiguidade)
        const isSpecificWithPhotos = isPhotoRequest && data.length <= 3
          && !(isGenericAcceptance && data.length > 1);
        // Include photo data ONLY when user asked for photos — NOT when generic acceptance + multiple vehicles
        const includePhotosInData = isPhotoRequest && data.length <= 3
          && !(isGenericAcceptance && data.length > 1);

        let _hint: string;
        if (isGenericAcceptance && data.length > 1) {
          _hint = `Cliente aceitou ver fotos mas há ${data.length} veículos. PERGUNTE qual prefere ver primeiro. NÃO envie fotos ainda.`;
        } else if (isSpecificWithPhotos) {
          _hint = "Envie TODAS as fotos do array 'photos' usando ![foto](URL). Antes das fotos, escreva UMA frase curta e VARIADA (NUNCA repita 'Aqui estão as fotos'). Use variações como: 'Dá uma olhada!', 'Olha só como ela está!', 'Veja que linda!', 'Tá aqui pra você conferir!'. PROIBIDO inventar atributos, acabamento, materiais ou equipamentos que não estejam explicitamente nos campos do veículo. NÃO faça pergunta de fechamento nesta mensagem — deixe o cliente reagir às fotos primeiro.";
        } else {
          _hint = `Apresente os ${data.length} veículos de forma NATURAL, como um vendedor experiente no WhatsApp. REGRAS ANTI-REPETIÇÃO: 1) NÃO repita o nome completo do carro se já mencionou antes — use apelidos curtos ("o Nivus", "o Haval", "esse aqui"). 2) Varie a estrutura das frases — cada parágrafo deve soar diferente. 3) NÃO use a mesma abertura para todos os carros. 4) Destaque algo ÚNICO de cada um (um é mais econômico, outro tem mais espaço, etc). 5) Finalize com UMA pergunta natural tipo "Algum te chamou atenção?" ou "Quer ver fotos de algum deles?". NÃO use listas numeradas. NÃO inclua fotos nesta resposta — ESPERE o cliente pedir. NÃO repita dados que o cliente já sabe.`;
        }

          return JSON.stringify({
          total: data.length,
          _hint,
          vehicles: data.map((v: any) => {
            if (!includePhotosInData) {
              // Listing mode (>3 results): compact, no photos to keep context small
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
        if (args.versao || args.version) fipeArgs.versao = args.versao || args.version;
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

      case "calendar_query": {
        // --- Helper: post-calendar-action (notify + assign) ---
        async function postCalendarAction(
          supabaseClient: any, agentIdLocal: string, ctx: { convId?: string; externalUserId?: string } | undefined,
          eventType: "agendamento" | "cancelamento" | "remarcacao",
          eventSummary: string
        ) {
          try {
            const { data: agentToolRows } = await supabaseClient
              .from("agent_tools")
              .select("tool_id, tools(id, tool_type, execution_config)")
              .eq("agent_id", agentIdLocal);

            const assignToolRow = agentToolRows?.find((at: any) => at.tools?.tool_type === "chatwoot_assign");
            const notifyToolRow = agentToolRows?.find((at: any) => at.tools?.tool_type === "send_notification");

            const { data: agCfg } = await supabaseClient.from("agents").select("config").eq("id", agentIdLocal).single();
            const c = (agCfg?.config || {}) as Record<string, any>;
            const cwUrl = c.chatwoot_url;
            const cwToken = c.chatwoot_api_token;
            const cwAccId = c.chatwoot_account_id;

            if (!cwUrl || !cwToken || !cwAccId) {
              console.warn(`[Calendar→Post] Missing Chatwoot config`);
              return;
            }

            // --- Find Chatwoot conversation ID (4-level lookup) ---
            let cwConvId: string | null = null;
            const cId = ctx?.convId;
            const extId = ctx?.externalUserId;
            console.log(`[Calendar→Post] Lookup CW conv: convId=${cId}, extUser=${extId}`);

            if (cId) {
              const { data: ex } = await supabaseClient.from("conversations").select("chatwoot_conversation_id").eq("id", cId).not("chatwoot_conversation_id", "is", null).maybeSingle();
              cwConvId = ex?.chatwoot_conversation_id || null;
              if (cwConvId) console.log(`[Calendar→Post] Found CW conv ${cwConvId} via convId`);
            }
            if (!cwConvId && extId) {
              const { data: byUser } = await supabaseClient.from("conversations").select("chatwoot_conversation_id").eq("agent_id", agentIdLocal).eq("external_user_id", extId).not("chatwoot_conversation_id", "is", null).order("started_at", { ascending: false }).limit(1);
              cwConvId = byUser?.[0]?.chatwoot_conversation_id || null;
              if (cwConvId) console.log(`[Calendar→Post] Found CW conv ${cwConvId} via ext user`);
            }
            if (!cwConvId) {
              const { data: rows } = await supabaseClient.from("conversations").select("chatwoot_conversation_id, id, external_user_id").eq("agent_id", agentIdLocal).not("chatwoot_conversation_id", "is", null).order("started_at", { ascending: false }).limit(3);
              console.log(`[Calendar→Post] Fallback: ${rows?.length || 0} convs`, JSON.stringify(rows?.map((r: any) => ({ id: r.id, cw: r.chatwoot_conversation_id, ext: r.external_user_id }))));
              cwConvId = rows?.[0]?.chatwoot_conversation_id || null;
            }
            if (!cwConvId && extId) {
              try {
                const phone = extId.replace(/\D/g, "");
                const sUrl = `${cwUrl.replace(/\/+$/, "")}/api/v1/accounts/${cwAccId}/contacts/search?q=${phone}&include_contacts=true`;
                console.log(`[Calendar→Post] Searching CW API for: ${phone}`);
                const sResp = await fetch(sUrl, { headers: { api_access_token: cwToken } });
                if (sResp.ok) {
                  const sData = await sResp.json();
                  const contacts = sData.payload || [];
                  if (contacts.length > 0) {
                    const cResp = await fetch(`${cwUrl.replace(/\/+$/, "")}/api/v1/accounts/${cwAccId}/contacts/${contacts[0].id}/conversations`, { headers: { api_access_token: cwToken } });
                    if (cResp.ok) {
                      const cData = await cResp.json();
                      const convs = cData.payload || [];
                      const openConv = convs.find((cv: any) => cv.status === "open") || convs[0];
                      if (openConv) { cwConvId = String(openConv.id); console.log(`[Calendar→Post] Found CW conv ${cwConvId} via API`); }
                    }
                  }
                }
              } catch (e) { console.warn("[Calendar→Post] CW API search failed:", e); }
            }

            // --- Assignment DISABLED for agendamento/remarcacao ---
            // Keeping the conversation unassigned so the AI bot continues responding
            // (e.g. if the client wants to reschedule). Assignment only on cancelamento if needed.
            if (eventType === "cancelamento" && assignToolRow?.tools && cwConvId) {
              const execCfg = (assignToolRow.tools.execution_config || {}) as Record<string, any>;
              let assigneeId = execCfg.assignee_id;
              const rules = Array.isArray(execCfg.rules) ? execCfg.rules : [];
              if (rules.length > 0) {
                for (const rule of rules) {
                  const rLabel = (rule.label || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  if (rLabel && rLabel.includes("cancel")) {
                    if (rule.assignee_id) assigneeId = rule.assignee_id;
                    console.log(`[Calendar→Assign] Matched cancel rule "${rule.label}"`);
                    break;
                  }
                }
              }
              const assignBody: Record<string, any> = {};
              if (assigneeId) assignBody.assignee_id = Number(assigneeId);
              console.log(`[Calendar→Assign] Conv ${cwConvId}:`, JSON.stringify(assignBody));
              const aResp = await fetch(`${cwUrl.replace(/\/+$/, "")}/api/v1/accounts/${cwAccId}/conversations/${cwConvId}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json", api_access_token: cwToken },
                body: JSON.stringify(assignBody),
              });
              console.log(`[Calendar→Assign] Status: ${aResp.status}`);
              if (!aResp.ok) console.warn(`[Calendar→Assign] Error:`, await aResp.text().catch(() => ""));
            } else if (eventType !== "cancelamento") {
              console.log(`[Calendar→Assign] Skipped assignment for ${eventType} — keeping bot active`);
            }

            // --- Cancel follow-ups (always, for any calendar action) ---
            if (cId) {
              try { await supabaseClient.rpc("cancel_pending_followups", { p_agent_id: agentIdLocal, p_conversation_id: cId }); console.log(`[Calendar→Post] Cancelled follow-ups for conv ${cId}`); } catch {}
            }

            // --- Notification (always) ---
            if (notifyToolRow?.tools) {
              const nCfg = (notifyToolRow.tools.execution_config || {}) as Record<string, any>;
              const targetCwCid = nCfg.conversation_id || nCfg.chatwoot_conversation_id || nCfg.group_conversation_id;
              if (targetCwCid) {
                const emoji = eventType === "cancelamento" ? "❌" : eventType === "remarcacao" ? "🔄" : "📋";
                const label = eventType === "cancelamento" ? "CANCELAMENTO" : eventType === "remarcacao" ? "REMARCAÇÃO" : "AGENDAMENTO";
                const msg = `${emoji} [${label}] ${eventSummary}`;
                console.log(`[Calendar→Notify] Sending to CW conv ${targetCwCid}: ${msg.slice(0, 100)}`);
                const nResp = await fetch(`${cwUrl.replace(/\/+$/, "")}/api/v1/accounts/${cwAccId}/conversations/${targetCwCid}/messages`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", api_access_token: cwToken },
                  body: JSON.stringify({ content: msg, message_type: "outgoing", private: false }),
                });
                console.log(`[Calendar→Notify] Status: ${nResp.status}`);
                if (!nResp.ok) console.warn(`[Calendar→Notify] Error:`, await nResp.text().catch(() => ""));
              } else {
                console.warn(`[Calendar→Notify] No conversation_id in tool config`);
              }
            }
          } catch (e) {
            console.warn("[Calendar→Post] Error (non-blocking):", e);
          }
        }

        // Query calendar availability and create appointments
        const { data: agentData } = await supabase
          .from("agents")
          .select("tenant_id")
          .eq("id", agentId)
          .single();

        if (!agentData?.tenant_id) return JSON.stringify({ error: "Agent has no tenant assigned" });

        const action = (args.action || args.acao || "check_availability").toLowerCase();

        if (action === "cancelar" || action === "cancel" || action === "desmarcar") {
          // Cancel an existing calendar event
          const eventId = args.event_id || args.evento_id;
          const title = args.title || args.titulo;
          const startAt = args.start_at || args.data_hora || args.datetime;
          const clientName = args.client_name || args.nome_cliente;

          if (!eventId && !title && !startAt && !clientName) {
            return JSON.stringify({ error: "Informe o event_id, título, nome do cliente ou data/hora do agendamento a cancelar" });
          }

          // Find the event to cancel — use ALL available filters for precision
          let findQuery = supabase
            .from("calendar_events")
            .select("id, title, start_at, end_at, description")
            .eq("tenant_id", agentData.tenant_id);

          if (eventId) {
            findQuery = findQuery.eq("id", eventId);
          } else {
            // Use start_at for precise matching when available
            if (startAt) {
              const startDate = new Date(startAt);
              // Use range match (same hour) to handle timezone offsets
              const rangeStart = new Date(startDate.getTime() - 3600000); // -1h
              const rangeEnd = new Date(startDate.getTime() + 3600000);   // +1h
              findQuery = findQuery.gte("start_at", rangeStart.toISOString()).lte("start_at", rangeEnd.toISOString());
            }
            // Also filter by title/name if available
            if (title) {
              findQuery = findQuery.ilike("title", `%${title}%`);
            } else if (clientName) {
              findQuery = findQuery.ilike("title", `%${clientName}%`);
            }
          }

          // Order by start_at ascending to get the closest future event
          findQuery = findQuery.order("start_at", { ascending: true });

          const { data: eventsToCancel, error: findError } = await findQuery.limit(10);

          if (findError) return JSON.stringify({ error: findError.message });
          if (!eventsToCancel?.length) {
            // Fallback: if no match with combined filters, try broader search
            console.warn(`[CalendarCancel] No events found with precise filters. Trying broader search...`);
            let broadQuery = supabase
              .from("calendar_events")
              .select("id, title, start_at, end_at, description")
              .eq("tenant_id", agentData.tenant_id)
              .gte("start_at", new Date().toISOString()) // only future events
              .order("start_at", { ascending: true });
            
            if (title) broadQuery = broadQuery.ilike("title", `%${title}%`);
            else if (clientName) broadQuery = broadQuery.ilike("title", `%${clientName}%`);
            
            const { data: broadResults } = await broadQuery.limit(5);
            if (!broadResults?.length) {
              return JSON.stringify({ error: "Nenhum agendamento encontrado com os dados informados", status: "nao_encontrado" });
            }
            // Use the closest future match
            const targetEvent = broadResults[0];
            const { error: deleteError } = await supabase
              .from("calendar_events")
              .delete()
              .eq("id", targetEvent.id);

            if (deleteError) return JSON.stringify({ error: deleteError.message });
            console.log(`[CalendarCancel] Deleted event (broad) ${targetEvent.id}: ${targetEvent.title} at ${targetEvent.start_at}`);
            
            // Post-cancel: notify
            const cancelSummary = `${targetEvent.title}\n📅 ${new Date(targetEvent.start_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n❌ Cancelado pela IA`;
            await postCalendarAction(supabase, agentId, context, "cancelamento", cancelSummary);

            return JSON.stringify({
              status: "cancelado",
              evento_cancelado: {
                id: targetEvent.id,
                titulo: targetEvent.title,
                inicio: targetEvent.start_at,
                fim: targetEvent.end_at,
              },
              _hint: "Cancelamento confirmado. A notificação já foi enviada automaticamente — NÃO chame send_notification.",
            });
          }

          // Pick the closest future event if multiple matches
          const now = new Date();
          const futureEvents = eventsToCancel.filter((e: any) => new Date(e.start_at) >= now);
          const targetEvent = futureEvents.length > 0 ? futureEvents[0] : eventsToCancel[0];

          const { error: deleteError } = await supabase
            .from("calendar_events")
            .delete()
            .eq("id", targetEvent.id);

          if (deleteError) return JSON.stringify({ error: deleteError.message });

          console.log(`[CalendarCancel] Deleted event ${targetEvent.id}: ${targetEvent.title} at ${targetEvent.start_at}`);

          // Post-cancel: notify
          const cancelSummary2 = `${targetEvent.title}\n📅 ${new Date(targetEvent.start_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n❌ Cancelado pela IA`;
          await postCalendarAction(supabase, agentId, context, "cancelamento", cancelSummary2);

          return JSON.stringify({
            status: "cancelado",
            evento_cancelado: {
              id: targetEvent.id,
              titulo: targetEvent.title,
              inicio: targetEvent.start_at,
              fim: targetEvent.end_at,
            },
            _hint: "Cancelamento confirmado. A notificação já foi enviada automaticamente — NÃO chame send_notification.",
          });
        }

        if (action === "create" || action === "agendar" || action === "criar") {
          // Create a new calendar event
          const title = args.title || args.titulo || "Agendamento via IA";
          const clientPhone = args.client_phone || args.telefone_cliente || "";
          const vehicleInterest = args.vehicle_interest || args.veiculo_interesse || "";
          
          // Build rich description with client info
          let descParts: string[] = [];
          if (args.description || args.descricao) descParts.push(args.description || args.descricao);
          if (clientPhone) descParts.push(`Telefone: ${clientPhone}`);
          if (vehicleInterest) descParts.push(`Veículo de interesse: ${vehicleInterest}`);
          const description = descParts.join("\n") || "";
          const startAt = args.start_at || args.data_hora || args.datetime;
          const durationMin = args.duration_minutes || args.duracao_minutos || 60;

          if (!startAt) return JSON.stringify({ error: "Data e hora são obrigatórios para agendar" });

          // Find the default calendar for this tenant
          let calendarId = args.calendar_id;
          if (!calendarId) {
            const { data: calendars } = await supabase
              .from("calendars")
              .select("id, name")
              .eq("tenant_id", agentData.tenant_id)
              .eq("is_active", true)
              .order("created_at", { ascending: true })
              .limit(1);

            if (!calendars?.length) return JSON.stringify({ error: "Nenhuma agenda configurada para este tenant" });
            calendarId = calendars[0].id;
          }

          // Calculate end time
          const startDate = new Date(startAt);
          const endDate = new Date(startDate.getTime() + durationMin * 60000);

          // Check for conflicts
          const { data: conflicts } = await supabase
            .from("calendar_events")
            .select("id, title, start_at, end_at")
            .eq("tenant_id", agentData.tenant_id)
            .eq("calendar_id", calendarId)
            .lt("start_at", endDate.toISOString())
            .gt("end_at", startDate.toISOString());

          if (conflicts && conflicts.length > 0) {
            return JSON.stringify({
              error: "Horário indisponível — já existe agendamento neste período",
              conflitos: conflicts.map((c: any) => ({
                titulo: c.title,
                inicio: c.start_at,
                fim: c.end_at,
              })),
            });
          }

          // Create the event
          const { data: newEvent, error: createError } = await supabase
            .from("calendar_events")
            .insert({
              calendar_id: calendarId,
              tenant_id: agentData.tenant_id,
              title,
              description,
              start_at: startDate.toISOString(),
              end_at: endDate.toISOString(),
              all_day: false,
              color: "primary",
            })
            .select()
            .single();

          if (createError) return JSON.stringify({ error: createError.message });

          // --- Post-booking: trigger assign + notify via helper ---
          const bookingSummary = `${title}\n📅 ${new Date(startAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n📞 ${clientPhone || "N/A"}\n🚗 Interesse: ${vehicleInterest || "Não informado"}\n✅ Agendado automaticamente pela IA`;
          await postCalendarAction(supabase, agentId, context, "agendamento", bookingSummary);

          // --- Schedule appointment reminder if enabled ---
          try {
            const reminderEnabled = (agentData.config as any)?.reminder_enabled;
            const reminderMinutes = Number((agentData.config as any)?.reminder_minutes_before) || 60;
            if (reminderEnabled && context.chatwoot_conversation_id) {
              const eventStart = new Date(startDate);
              const remindAt = new Date(eventStart.getTime() - reminderMinutes * 60 * 1000);
              // Only schedule if remind_at is in the future
              if (remindAt > new Date()) {
                await supabase.from("appointment_reminders").insert({
                  agent_id: agentId,
                  tenant_id: agentData.tenant_id,
                  calendar_event_id: newEvent.id,
                  conversation_id: context.conversation_id,
                  external_user_id: context.external_user_id || "",
                  chatwoot_conversation_id: context.chatwoot_conversation_id,
                  event_title: title,
                  event_start_at: startDate.toISOString(),
                  remind_at: remindAt.toISOString(),
                });
                console.log(`[Calendar] Reminder scheduled ${reminderMinutes}min before event at ${remindAt.toISOString()}`);
              }
            }
          } catch (reminderErr) {
            console.warn("[Calendar] Could not schedule reminder:", reminderErr);
          }

          return JSON.stringify({
            status: "agendado",
            evento: {
              id: newEvent.id,
              titulo: newEvent.title,
              inicio: newEvent.start_at,
              fim: newEvent.end_at,
              descricao: newEvent.description,
            },
            _hint: "Agendamento confirmado. A notificação para a equipe já foi enviada automaticamente — NÃO chame send_notification novamente.",
            _chatwoot_handover: true,
          });
        }

        // Default: check availability
        const dateStr = args.date || args.data || new Date().toISOString().split("T")[0];
        const daysAhead = args.days_ahead || args.dias || 7;

        // Build date range
        const fromDate = new Date(dateStr + "T00:00:00-03:00");
        const toDate = new Date(fromDate.getTime() + daysAhead * 86400000);

        // Get all calendars for this tenant
        let calendarFilter = args.calendar_id;
        let calendarIds: string[] = [];

        if (calendarFilter) {
          calendarIds = [calendarFilter];
        } else {
          const { data: calendars } = await supabase
            .from("calendars")
            .select("id, name")
            .eq("tenant_id", agentData.tenant_id)
            .eq("is_active", true);

          if (!calendars?.length) return JSON.stringify({ message: "Nenhuma agenda configurada" });
          calendarIds = calendars.map((c: any) => c.id);
        }

        // Get existing events in the range
        const { data: existingEvents, error: evError } = await supabase
          .from("calendar_events")
          .select("id, title, start_at, end_at, calendar_id, all_day")
          .eq("tenant_id", agentData.tenant_id)
          .in("calendar_id", calendarIds)
          .gte("start_at", fromDate.toISOString())
          .lte("start_at", toDate.toISOString())
          .order("start_at", { ascending: true });

        if (evError) return JSON.stringify({ error: evError.message });

        // Build availability summary
        const busySlots = (existingEvents || []).map((ev: any) => ({
          titulo: ev.title,
          inicio: ev.start_at,
          fim: ev.end_at,
          dia_inteiro: ev.all_day,
        }));

        // Generate available slots (business hours 8-18, 1h blocks)
        const availableSlots: { data: string; horarios: string[] }[] = [];
        for (let d = 0; d < daysAhead; d++) {
          const day = new Date(fromDate.getTime() + d * 86400000);
          const dayOfWeek = day.getDay();
          if (dayOfWeek === 0) continue; // Skip Sunday

          const dayStr = day.toISOString().split("T")[0];
          const slots: string[] = [];

          for (let hour = 8; hour < 18; hour++) {
            const slotStart = new Date(`${dayStr}T${String(hour).padStart(2, "0")}:00:00-03:00`);
            const slotEnd = new Date(slotStart.getTime() + 3600000);

            // Check if slot conflicts with any event
            const hasConflict = busySlots.some((ev: any) => {
              if (ev.dia_inteiro) return true;
              const evStart = new Date(ev.inicio);
              const evEnd = new Date(ev.fim);
              return slotStart < evEnd && slotEnd > evStart;
            });

            if (!hasConflict) {
              slots.push(`${String(hour).padStart(2, "0")}:00`);
            }
          }

          if (slots.length > 0) {
            const weekday = day.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
            availableSlots.push({ data: `${dayStr} (${weekday})`, horarios: slots });
          }
        }

        // Build dynamic SDR hint with REAL slot examples from the data
        // Also compute per-day summary for fully booked days
        const totalSlotsAllDays = availableSlots.reduce((acc, d) => acc + d.horarios.length, 0);
        
        let sdrExamples = "";
        let fullDayWarning = "";
        
        if (availableSlots.length > 0) {
          const firstDay = availableSlots[0];
          const daySlots = firstDay.horarios;
          const morningSlots = daySlots.filter((s: string) => parseInt(s) < 12);
          const afternoonSlots = daySlots.filter((s: string) => parseInt(s) >= 12);
          
          // Pick 2 intercalated slots for each period from REAL availability
          const pickIntercalated = (slots: string[]) => {
            if (slots.length <= 1) return slots;
            if (slots.length === 2) return slots;
            const first = slots[0];
            const secondIdx = Math.min(2, slots.length - 1);
            return [first, slots[secondIdx]];
          };
          
          if (morningSlots.length >= 2) {
            const picked = pickIntercalated(morningSlots);
            sdrExamples += ` Se manhã → ofereça ${picked[0]} e ${picked[1]}.`;
          } else if (morningSlots.length === 1) {
            sdrExamples += ` Se manhã → o ÚNICO horário disponível é ${morningSlots[0]}.`;
          } else {
            sdrExamples += ` Manhã: SEM horários disponíveis — informe ao cliente que a manhã está lotada.`;
          }
          if (afternoonSlots.length >= 2) {
            const picked = pickIntercalated(afternoonSlots);
            sdrExamples += ` Se tarde → ofereça ${picked[0]} e ${picked[1]}.`;
          } else if (afternoonSlots.length === 1) {
            sdrExamples += ` Se tarde → o ÚNICO horário disponível é ${afternoonSlots[0]}.`;
          } else {
            sdrExamples += ` Tarde: SEM horários disponíveis — informe ao cliente que a tarde está lotada.`;
          }
        }
        
        // Check if any requested day has ZERO availability
        if (availableSlots.length === 0) {
          fullDayWarning = " ATENÇÃO: TODOS os horários no período consultado estão OCUPADOS. Informe ao cliente que não há vaga nesse período e sugira consultar o próximo dia útil disponível.";
        }

        return JSON.stringify({
          periodo: `${fromDate.toISOString().split("T")[0]} a ${toDate.toISOString().split("T")[0]}`,
          horarios_disponiveis: availableSlots,
          total_horarios_livres: totalSlotsAllDays,
          compromissos_existentes: busySlots.length,
          _hint: `REGRA ABSOLUTA — SOMENTE HORÁRIOS DISPONÍVEIS: Você pode APENAS sugerir horários que aparecem no array "horarios_disponiveis" acima. Qualquer horário que NÃO está listado ali já está OCUPADO por outro cliente. Sugerir horário ocupado é ERRO GRAVE.${fullDayWarning}

ESTRATÉGIA SDR: NÃO liste todos os horários. Pergunte se prefere manhã ou tarde. Depois ofereça NO MÁXIMO 2 horários INTERCALADOS do período — mas SOMENTE se existirem no array acima.${sdrExamples}

SE UM PERÍODO ESTÁ LOTADO: Informe ao cliente que aquele período está cheio e sugira o outro período ou o próximo dia com vagas.
SE O DIA INTEIRO ESTÁ LOTADO: Informe "Para o dia X nossa agenda já está completa" e sugira o próximo dia com horários livres (consulte novamente se necessário).
SE SÓ HÁ 1 HORÁRIO: Ofereça apenas esse. "Tenho um horário disponível às HH:00, funciona pra você?"

Quando o cliente ESCOLHER, o dispatcher DEVE chamar consultar_agenda(action='criar') para confirmar. O agendamento só é real quando a ferramenta criar o evento.`,
        });
      }

      case "chatwoot_assign": {
        // Read config with rules support
        const execCfg = (tool.execution_config || {}) as Record<string, any>;
        const reason = args.reason || "escalation";
        const rules = Array.isArray(execCfg.rules) ? execCfg.rules : [];

        // Direct override via tool arguments (preferred when provided)
        const directAssignee = args.assignee_id ? Number(args.assignee_id) : null;

        // Match rule by reason (fuzzy match on label)
        let assigneeId = directAssignee ?? execCfg.assignee_id; // default
        let matchedRule = "";

        if (!directAssignee && rules.length > 0) {
          const reasonNorm = reason.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          let bestScore = 0;
          for (const rule of rules) {
            if (!rule.label) continue;
            const labelNorm = rule.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const tokens = labelNorm.split(/\s+/).filter((t: string) => t.length >= 3);
            const score = tokens.reduce((acc: number, tok: string) => acc + (reasonNorm.includes(tok) ? 1 : 0), 0);
            if (score > bestScore) {
              bestScore = score;
              assigneeId = rule.assignee_id ?? assigneeId;
              matchedRule = rule.label;
            }
          }
          console.log(`[ChatwootAssign] Matched rule: "${matchedRule}" (score ${bestScore}) for reason: "${reason}"`);
        }

        // Load agent's Chatwoot config
        const { data: agentCfgRow } = await supabase
          .from("agents")
          .select("config")
          .eq("id", agentId)
          .single();
        const agCfg = (agentCfgRow?.config || {}) as Record<string, any>;
        const cwUrl = agCfg.chatwoot_url;
        const cwToken = agCfg.chatwoot_api_token;
        const cwAccountId = agCfg.chatwoot_account_id;

        if (!cwUrl || !cwToken || !cwAccountId) {
          return JSON.stringify({ error: "Chatwoot não configurado neste agente" });
        }

        // Find the current chatwoot conversation — prefer exact match via context
        let cwConvId: string | null = null;
        const ctxConvId2 = context?.convId;
        const ctxExtUserId2 = context?.externalUserId;

        if (ctxConvId2) {
          const { data: exactConv } = await supabase
            .from("conversations")
            .select("chatwoot_conversation_id, id")
            .eq("id", ctxConvId2)
            .not("chatwoot_conversation_id", "is", null)
            .maybeSingle();
          cwConvId = exactConv?.chatwoot_conversation_id || null;
          if (cwConvId) console.log(`[ChatwootAssign] Found CW conv ${cwConvId} via exact convId`);
        }

        if (!cwConvId && ctxExtUserId2) {
          const { data: convByUser } = await supabase
            .from("conversations")
            .select("chatwoot_conversation_id, id")
            .eq("agent_id", agentId)
            .eq("external_user_id", ctxExtUserId2)
            .not("chatwoot_conversation_id", "is", null)
            .order("started_at", { ascending: false })
            .limit(1);
          cwConvId = convByUser?.[0]?.chatwoot_conversation_id || null;
          if (cwConvId) console.log(`[ChatwootAssign] Found CW conv ${cwConvId} via external_user_id`);
        }

        if (!cwConvId) {
          const { data: cwConvRows } = await supabase
            .from("conversations")
            .select("chatwoot_conversation_id, id")
            .eq("agent_id", agentId)
            .not("chatwoot_conversation_id", "is", null)
            .order("started_at", { ascending: false })
            .limit(1);
          cwConvId = cwConvRows?.[0]?.chatwoot_conversation_id || null;
          if (cwConvId) console.log(`[ChatwootAssign] Using fallback most-recent CW conv ${cwConvId}`);
        }

        if (!cwConvId) {
          return JSON.stringify({ error: "Nenhuma conversa Chatwoot ativa encontrada" });
        }

        const baseUrl = cwUrl.replace(/\/+$/, "");
        const assignUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${cwConvId}/assignments`;
        const assignBody: Record<string, any> = {};
        if (assigneeId) assignBody.assignee_id = Number(assigneeId);

        console.log(`[ChatwootAssign] Conv ${cwConvId}, reason: ${reason}, body:`, assignBody);
        const resp = await fetch(assignUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", api_access_token: cwToken },
          body: JSON.stringify(assignBody),
        });

        const respText = await resp.text();
        if (!resp.ok) {
          console.warn(`[ChatwootAssign] Failed: ${resp.status}`, respText);
          return JSON.stringify({ error: `Falha na atribuição: ${resp.status}` });
        }

        console.log(`[ChatwootAssign] Success`);

        // Cancel follow-ups
        try {
          const convIdCancel = ctxConvId2 || null;
          if (convIdCancel) {
            await supabase.rpc("cancel_pending_followups", {
              p_agent_id: agentId,
              p_conversation_id: convIdCancel,
            });
            console.log(`[ChatwootAssign] Cancelled follow-ups for ${convIdCancel}`);
          }
        } catch (e) {
          console.warn("[ChatwootAssign] Cancel follow-ups error:", e);
        }

        // Auto-send notification to team group
        try {
          const { data: agToolRows } = await supabase
            .from("agent_tools")
            .select("tool_id, tools(id, tool_type, execution_config)")
            .eq("agent_id", agentId);
          const notifyRow = agToolRows?.find((at: any) => at.tools?.tool_type === "send_notification");
          if (notifyRow?.tools) {
            const nCfg2 = (notifyRow.tools.execution_config || {}) as Record<string, any>;
            const targetCid = nCfg2.conversation_id || nCfg2.chatwoot_conversation_id || nCfg2.group_conversation_id;
            if (targetCid) {
              // Build brief summary from context
              const extUser = ctxExtUserId2 || "N/A";
              
              // Try to extract client name from conversation history
              let clientNameNotif = "Não identificado";
              const ctxMsgs = (context as any)?.messages || [];
              const recentAssistantMsgs = ctxMsgs.filter((m: any) => m.role === "assistant" && m.content).slice(-6);
              for (const m of recentAssistantMsgs) {
                const nameMatch = m.content.match(/(?:prazer|obrigad[oa]),?\s+([A-ZÀ-Ú][a-zà-ú]+)/);
                if (nameMatch) { clientNameNotif = nameMatch[1]; break; }
              }
              // Also try from user messages (e.g., "meu nome é Kevin")
              if (clientNameNotif === "Não identificado") {
                const userMsgs = ctxMsgs.filter((m: any) => m.role === "user" && m.content).slice(-10);
                for (const m of userMsgs) {
                  const userNameMatch = m.content.match(/(?:meu nome é|me chamo|sou o|sou a)\s+([A-ZÀ-Ú][a-zà-ú]+)/i);
                  if (userNameMatch) { clientNameNotif = userNameMatch[1]; break; }
                }
              }
              
              // Build summary from recent user messages
              const recentUserMsgs = ctxMsgs.filter((m: any) => m.role === "user" && m.content).slice(-3);
              const briefSummary = recentUserMsgs.map((m: any) => m.content?.slice(0, 100)).filter(Boolean).join(" | ") || "Sem resumo disponível";
              
              const notifMsg = `🙋 [LEAD AGUARDANDO ATENDIMENTO HUMANO]\n\nCliente: ${clientNameNotif}\nTelefone: ${extUser}\nMotivo: ${reason}\nResumo: ${briefSummary}\n\nO lead foi atribuído a um agente humano e aguarda atendimento.`;
              console.log(`[ChatwootAssign→Notify] Sending to CW conv ${targetCid}`);
              const nResp = await fetch(`${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${targetCid}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", api_access_token: cwToken },
                body: JSON.stringify({ content: notifMsg, message_type: "outgoing", private: false }),
              });
              console.log(`[ChatwootAssign→Notify] Status: ${nResp.status}`);
            }
          }
        } catch (e) { console.warn("[ChatwootAssign→Notify] Error:", e); }

        return JSON.stringify({
          status: "atribuido",
          assignee_id: assigneeId || null,
          reason,
          _hint: "Atendente humano foi atribuído à conversa. A notificação para a equipe já foi enviada automaticamente — NÃO chame send_notification novamente. Informe ao cliente que um especialista irá dar sequência ao atendimento em breve.",
        });
      }

      case "send_notification": {
        const execCfg = (tool.execution_config || {}) as Record<string, any>;
        const channel = execCfg.channel || "chatwoot_message";
        const eventType = args.event_type || "custom";
        let message = args.message || execCfg.template || "Notificação do sistema";

        console.log(`[SendNotification] Config: channel=${channel}, execCfg keys=${Object.keys(execCfg).join(",")}`);

        // Template variable replacement
        if (args.cliente) message = message.replace(/\{\{cliente\}\}/g, args.cliente);
        if (args.horario) message = message.replace(/\{\{horario\}\}/g, args.horario);
        if (args.motivo) message = message.replace(/\{\{motivo\}\}/g, args.motivo);

        if (channel === "chatwoot_message") {
          // Load agent's Chatwoot config
          const { data: agCfgRow2 } = await supabase
            .from("agents")
            .select("config")
            .eq("id", agentId)
            .single();
          const cfg2 = (agCfgRow2?.config || {}) as Record<string, any>;
          const cwUrl2 = cfg2.chatwoot_url;
          const cwToken2 = cfg2.chatwoot_api_token;
          const cwAccountId2 = cfg2.chatwoot_account_id;

          if (!cwUrl2 || !cwToken2 || !cwAccountId2) {
            console.error(`[SendNotification] Missing Chatwoot config: url=${!!cwUrl2}, token=${!!cwToken2}, accountId=${!!cwAccountId2}`);
            return JSON.stringify({ error: "Chatwoot não configurado no agente", status: "falha" });
          }

          // Determine target conversation: prefer group conversation_id from tool config, fallback to current conversation
          const targetCwConvId = execCfg.conversation_id || execCfg.chatwoot_conversation_id || execCfg.group_conversation_id;

          let cwCid: string | null = targetCwConvId || null;

          if (!cwCid) {
            // Fallback: use the most recent Chatwoot conversation for this agent
            const { data: convRows2 } = await supabase
              .from("conversations")
              .select("chatwoot_conversation_id")
              .eq("agent_id", agentId)
              .not("chatwoot_conversation_id", "is", null)
              .order("started_at", { ascending: false })
              .limit(1);
            cwCid = convRows2?.[0]?.chatwoot_conversation_id || null;
          }

          if (!cwCid) {
            console.error(`[SendNotification] No target Chatwoot conversation found`);
            return JSON.stringify({ error: "Nenhuma conversa Chatwoot encontrada", status: "falha" });
          }

          console.log(`[SendNotification] Sending to Chatwoot conv ${cwCid} (from config: ${!!targetCwConvId})`);

          const noteUrl = `${cwUrl2.replace(/\/+$/, "")}/api/v1/accounts/${cwAccountId2}/conversations/${cwCid}/messages`;
          const noteResp = await fetch(noteUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", api_access_token: cwToken2 },
            body: JSON.stringify({
              content: `📋 [${eventType.toUpperCase()}] ${message}`,
              message_type: "outgoing",
              private: false,
            }),
          });

          if (!noteResp.ok) {
            const errBody = await noteResp.text().catch(() => "");
            console.error(`[SendNotification] Chatwoot API error: ${noteResp.status} ${errBody}`);
            return JSON.stringify({ error: `Chatwoot error: ${noteResp.status}`, status: "falha" });
          }

          console.log(`[SendNotification] Chatwoot message sent: ${noteResp.status} to conv ${cwCid}`);
        } else if (channel === "webhook" && execCfg.webhook_url) {
          // Fire a webhook
          const webhookResp = await fetch(execCfg.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event_type: eventType, message, agent_id: agentId, timestamp: new Date().toISOString() }),
          });
          console.log(`[SendNotification] Webhook fired: ${webhookResp.status}`);
          if (!webhookResp.ok) {
            const errBody = await webhookResp.text().catch(() => "");
            console.error(`[SendNotification] Webhook error: ${webhookResp.status} ${errBody}`);
          }
        } else {
          console.error(`[SendNotification] Unknown channel '${channel}' or missing config`);
          return JSON.stringify({ error: `Canal desconhecido: ${channel}`, status: "falha" });
        }

        return JSON.stringify({
          status: "notificado",
          channel,
          event_type: eventType,
          _hint: "Notificação enviada com sucesso. Continue o atendimento normalmente.",
        });
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
        versao: { type: "string", description: "Versão/acabamento do veículo (ex: LTZ, EXL, Highline, Touring)" },
        ano:    { type: "integer", description: "Ano do veículo (ex: 2023)" },
        codigo_fipe: { type: "string", description: "Código FIPE direto se disponível (ex: 001004-9)" },
        tipo:   { type: "integer", description: "Tipo: 1=carros (padrão), 2=motos, 3=caminhões" },
      },
      required: ["marca", "modelo"],
    },
  },
  calendar_query: {
    description: "Consulta horários disponíveis na agenda e realiza agendamentos. Use 'check_availability' para ver horários livres e 'criar' para agendar. ATENÇÃO: 'veiculo_interesse' é o veículo que o cliente QUER COMPRAR do nosso estoque, NÃO o veículo que ele já possui ou quer dar como entrada/troca. Se o cliente quer avaliar o carro DELE para troca, isso é consulta FIPE, não veículo de interesse.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Ação: 'check_availability' para consultar horários, 'criar' ou 'agendar' para criar agendamento, 'cancelar' para cancelar" },
        date: { type: "string", description: "Data inicial para busca (formato YYYY-MM-DD). Padrão: hoje" },
        days_ahead: { type: "integer", description: "Quantos dias à frente consultar (padrão: 7)" },
        title: { type: "string", description: "Título do agendamento no formato 'Visita - Nome' (ex: 'Visita - João Silva')" },
        description: { type: "string", description: "Descrição/observações do agendamento" },
        start_at: { type: "string", description: "Data e hora do agendamento (formato ISO 8601, ex: '2025-03-15T10:00:00')" },
        duration_minutes: { type: "integer", description: "Duração em minutos (padrão: 60)" },
        calendar_id: { type: "string", description: "ID da agenda específica (opcional, usa a primeira agenda ativa se não informado)" },
        telefone_cliente: { type: "string", description: "Telefone do cliente (extraído do external_user_id ou conversa)" },
        veiculo_interesse: { type: "string", description: "SOMENTE o veículo que o cliente QUER COMPRAR do nosso estoque (ex: 'Haval H6 2024'). NÃO coloque aqui o veículo que o cliente JÁ TEM ou quer dar como entrada/troca. Se não souber qual veículo do estoque ele quer, deixe vazio." },
        client_name: { type: "string", description: "Nome do cliente para cancelamentos" },
      },
      required: ["action"],
    },
  },
  chatwoot_assign: {
    description: "Atribui a conversa atual a um atendente humano no Chatwoot. Preferencialmente envie assignee_id direto no argumento JSON.",
    parameters: {
      type: "object",
      properties: {
        assignee_id: { type: "integer", description: "ID do atendente humano no Chatwoot (ex: 15). Use este campo como prioridade para atribuição direta." },
        reason: { type: "string", description: "Motivo da atribuição (ex: 'agendamento_realizado', 'solicitacao_cliente', 'escalacao')" },
      },
      required: [],
    },
  },
  send_notification: {
    description: "Envia uma notificação sobre um evento importante (agendamento, cancelamento, escalação). Usada para alertar a equipe.",
    parameters: {
      type: "object",
      properties: {
        event_type: { type: "string", description: "Tipo: 'booking', 'cancellation', 'escalation', 'custom'" },
        message: { type: "string", description: "Mensagem da notificação com detalhes do evento" },
      },
      required: ["event_type", "message"],
    },
  },
};

// ---------- convert tools to OpenAI format ----------
// Sanitize tool names to match OpenAI's pattern: ^[a-zA-Z0-9_-]+$
function sanitizeToolName(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents (ã→a, é→e, ç→c)
    .replace(/[^a-zA-Z0-9_-]/g, "_") // replace invalid chars with underscore
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/^_|_$/g, ""); // trim leading/trailing underscores
}

function toolsToOpenAI(tools: ToolDef[]) {
  return tools.map((t) => {
    const builtin = BUILTIN_SCHEMAS[t.tool_type];
    const hasValidParams = t.function_def?.parameters && t.function_def.parameters.type === "object"
      && t.function_def.parameters.properties && Object.keys(t.function_def.parameters.properties).length > 0;

    const rawName = t.function_def?.name || t.name;
    const safeName = sanitizeToolName(rawName);
    if (safeName !== rawName) {
      console.warn(`[Tools] Sanitized tool name: "${rawName}" → "${safeName}"`);
    }

    return {
      type: "function" as const,
      function: {
        name: safeName,
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
    // IMPORTANT: Public demo links call this function without user session.
    // Prefer service role for backend reads to avoid anon-RLS blocking in demo mode.
    const dataApiKey = nexusServiceKey || nexusKey;
    const supabase = createClient(nexusUrl, dataApiKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    // Service-role client for privileged operations (usage_events/save_message)
    const supabaseAdmin = nexusServiceKey
      ? createClient(nexusUrl, nexusServiceKey)
      : supabase;

    const saveMessageWithFallback = async (payload: Record<string, any>, logPrefix: string) => {
      // IMPORTANT: Some Nexus environments have BOTH signatures below at the same time:
      // - save_message(..., p_latency_ms)
      // - save_message(..., p_latency_ms, p_metadata)
      // Calling with 8 args is ambiguous (PGRST203). To force the 9-arg signature,
      // always send non-null metadata on first attempt.
      const metadataAwarePayload = Object.prototype.hasOwnProperty.call(payload, "p_metadata")
        ? { ...payload, p_metadata: payload.p_metadata ?? {} }
        : payload;

      const { data, error } = await supabaseAdmin.rpc("save_message", metadataAwarePayload);
      if (!error) return { data, error: null };

      const errorText = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
      const canRetryLegacy = Object.prototype.hasOwnProperty.call(payload, "p_metadata")
        && /metadata|p_metadata|function.*save_message|PGRST203|PGRST202/i.test(errorText);

      if (!canRetryLegacy) return { data: null, error };

      const { p_metadata, ...legacyPayload } = payload;
      console.warn(`[${logPrefix}] save_message fallback: retrying without p_metadata`);
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin.rpc("save_message", legacyPayload);

      if (!fallbackError) {
        console.log(`[${logPrefix}] save_message fallback succeeded (legacy signature)`);
      }

      return { data: fallbackData ?? null, error: fallbackError ?? null };
    };

    const { agent_id, messages, conversation_id, attachments, external_user_id } = await req.json();

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
              versao: { type: "string", description: "Versão/acabamento (ex: LTZ, EXL, Highline)" },
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

    // SAFETY NET: Ensure calendar_query tool is always available for tenants that need scheduling
    const hasCalendarToolLinked = agentTools.some((t) => t.tool_type === "calendar_query");
    const isIvmTenant = tenantSlugLoaded === "instituto-vicentim-maekawa" || tenantSlugLoaded === "insituto-vicentim-maekawa";
    const needsCalendarTool = isPplTenant || isIvmTenant;

    if (needsCalendarTool && !hasCalendarToolLinked) {
      // Build tenant-appropriate descriptions
      const calendarDescription = isIvmTenant
        ? "Consulta horários disponíveis na agenda e realiza agendamentos de consultas e avaliações odontológicas."
        : "Consulta horários disponíveis na agenda e realiza agendamentos de visitas e test drives.";
      const titleDescription = isIvmTenant
        ? "Título do agendamento: nome do paciente + motivo (ex: 'Carolina — Avaliação Implante')"
        : "Título do agendamento no formato 'Visita - Nome' (ex: 'Visita - Keven')";
      const extraFieldDesc = isIvmTenant
        ? "Motivo da consulta ou tratamento de interesse (ex: 'Implante dentário', 'Clareamento')"
        : "SOMENTE o veículo que o cliente QUER COMPRAR do estoque (ex: 'Haval H6 2024'). NÃO coloque o carro que o cliente já tem ou quer dar como entrada. Se não souber, deixe vazio.";

      const virtualCalendarTool: ToolDef = {
        id: "virtual-calendar-query-tool",
        name: "consultar_agenda",
        description: calendarDescription,
        tool_type: "calendar_query",
        function_def: {
          name: "consultar_agenda",
          description: "Consulta horários disponíveis na agenda e realiza agendamentos. Use 'check_availability' para ver horários livres e 'criar' para agendar.",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", description: "Ação: 'check_availability' para consultar horários ou 'criar' para agendar", enum: ["check_availability", "criar"] },
              date: { type: "string", description: "Data para consulta (formato YYYY-MM-DD, padrão: hoje)" },
              days_ahead: { type: "integer", description: "Quantos dias consultar a partir da data (padrão: 3)" },
              title: { type: "string", description: titleDescription },
              start_at: { type: "string", description: "Data e hora do agendamento (formato ISO 8601, ex: '2025-03-15T10:00:00')" },
              duration_minutes: { type: "integer", description: "Duração em minutos (padrão: 60)" },
              telefone_cliente: { type: "string", description: "Número de telefone/WhatsApp do cliente (ex: '5515991234567')" },
              veiculo_interesse: { type: "string", description: extraFieldDesc },
            },
            required: ["action"],
          },
        },
        execution_config: {},
        endpoint: null,
        auth_config: {},
      };
      agentTools.push(virtualCalendarTool);
      console.warn(`[Tools] calendar_query missing from agent_tools; injected virtual consultar_agenda for ${tenantSlugLoaded}`);
    }

    console.log(`[Tools] Loaded ${agentTools.length} tool(s): ${agentTools.map((t) => `${t.name}:${t.tool_type}`).join(", ")}`);


    // 4. Memory: create or reuse conversation
    let convId = conversation_id;
    if (!convId) {
      try {
        const { data, error } = await supabaseAdmin.rpc("create_conversation", {
          p_agent_id: agent_id,
          p_channel: "sandbox",
          p_external_user_id: null,
          p_contact_name: null,
          p_contact_avatar_url: null,
        });
        if (error) {
          console.error("[CreateConv] RPC error:", error.message, error.details, error.hint, error.code);
        }
        if (!error && data) {
          convId = data;
          console.log("[CreateConv] OK, convId:", convId);
        }
      } catch (e: any) {
        console.error("[CreateConv] EXCEPTION:", e?.message || e);
      }
    }

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    const hasIncomingAttachments = Array.isArray(attachments) && attachments.length > 0;

    // For media messages, we defer persistence until after transcription/image notes are appended
    if (convId && lastUserMsg?.role === "user" && !hasIncomingAttachments) {
      try {
        const { data: savedUserMsg, error: saveUserErr } = await saveMessageWithFallback({
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "user",
          p_content: lastUserMsg.content,
          p_model: null,
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: null,
          p_metadata: null,
        }, "SaveUser");
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
    const blockGapMs: number = agentConfig.block_gap_ms ?? 2000;
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
        let audioBase64: string;
        let audioMime: string;
        let audioSize: number;

        // Handle both data URLs (from sandbox) and HTTP URLs (from Chatwoot/WhatsApp)
        if (audio.data_url.startsWith("data:")) {
          // Extract base64 and mime from data URL: data:audio/webm;base64,XXXX
          const dataUrlMatch = audio.data_url.match(/^data:([^;]+);base64,(.+)$/);
          if (!dataUrlMatch) {
            console.error("[Media] Invalid data URL format for audio");
            continue;
          }
          audioMime = dataUrlMatch[1];
          audioBase64 = dataUrlMatch[2];
          audioSize = Math.ceil(audioBase64.length * 3 / 4);
          console.log(`[Media] Audio from data URL (${audioSize} bytes, ${audioMime})`);
        } else {
          console.log(`[Media] Downloading audio: ${audio.data_url.slice(0, 80)}...`);
          const audioResp = await fetch(audio.data_url);
          if (!audioResp.ok) {
            console.error(`[Media] Audio download failed: ${audioResp.status}`);
            continue;
          }
          const audioBuffer = await audioResp.arrayBuffer();
          const audioBytes = new Uint8Array(audioBuffer);
          audioBase64 = btoa(String.fromCharCode(...audioBytes));
          audioSize = audioBytes.length;

          // Detect MIME type from URL or default to audio/ogg (WhatsApp default)
          const urlLower = audio.data_url.toLowerCase();
          audioMime = "audio/ogg";
          if (urlLower.includes(".mp3") || urlLower.includes("audio/mpeg")) audioMime = "audio/mp3";
          else if (urlLower.includes(".wav")) audioMime = "audio/wav";
          else if (urlLower.includes(".aac")) audioMime = "audio/aac";
          else if (urlLower.includes(".flac")) audioMime = "audio/flac";
          else if (urlLower.includes(".m4a")) audioMime = "audio/mp4";
        }

        console.log(`[Media] Transcribing audio (${audioSize} bytes, ${audioMime}) via ${provider.name}`);

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
              audio_size: audioSize,
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
        let imgBase64: string;
        let imgMime: string;
        let imgSize: number;

        if (img.data_url.startsWith("data:")) {
          const dataUrlMatch = img.data_url.match(/^data:([^;]+);base64,(.+)$/);
          if (!dataUrlMatch) {
            console.error("[Media] Invalid data URL format for image");
            continue;
          }
          imgMime = dataUrlMatch[1];
          imgBase64 = dataUrlMatch[2];
          imgSize = Math.ceil(imgBase64.length * 3 / 4);
          if (imgSize > 4 * 1024 * 1024) {
            console.warn(`[Media] Image too large (${imgSize} bytes), skipping`);
            continue;
          }
          console.log(`[Media] Image from data URL (${imgSize} bytes, ${imgMime})`);
        } else {
          console.log(`[Media] Downloading image: ${img.data_url.slice(0, 80)}...`);
          const imgResp = await fetch(img.data_url);
          if (!imgResp.ok) {
            console.error(`[Media] Image download failed: ${imgResp.status}`);
            continue;
          }
          const imgBuffer = await imgResp.arrayBuffer();
          const imgBytes = new Uint8Array(imgBuffer);
          if (imgBytes.length > 4 * 1024 * 1024) {
            console.warn(`[Media] Image too large (${imgBytes.length} bytes), skipping`);
            continue;
          }
          imgBase64 = btoa(String.fromCharCode(...imgBytes));
          imgSize = imgBytes.length;

          const urlLower = img.data_url.toLowerCase();
          imgMime = "image/jpeg";
          if (urlLower.includes(".png")) imgMime = "image/png";
          else if (urlLower.includes(".webp")) imgMime = "image/webp";
          else if (urlLower.includes(".gif")) imgMime = "image/gif";
        }

        imageBase64Parts.push({ mime_type: imgMime, base64: imgBase64 });
        console.log(`[Media] Image prepared (${imgSize} bytes, ${imgMime})`);
        debugTrace.push({
          type: "image_attachment",
          mime_type: imgMime,
          size: imgSize,
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
        const { data: savedUserMsg, error: saveUserErr } = await saveMessageWithFallback({
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "user",
          p_content: lastUserMsg.content || "",
          p_model: null,
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: null,
          p_metadata: null,
        }, "SaveUser][Media");
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
              const { error: saveAssistantErr } = await saveMessageWithFallback({
                p_agent_id: agent_id,
                p_conversation_id: convId,
                p_role: "assistant",
                p_content: fullContent,
                p_model: model,
                p_tokens_input: 0,
                p_tokens_output: 0,
                p_latency_ms: latency,
                p_metadata: null,
              }, "SaveAssistant][Stream");
              if (saveAssistantErr) console.warn("Could not save assistant msg:", saveAssistantErr.message);
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

    // Sanitize history: 
    // 1) Remove "tool" role messages from history — they cause 400 errors when sent without
    //    their preceding assistant message with tool_calls (which is not persisted).
    // 2) Replace photo URLs with markers so LLM doesn't reproduce old photos.
    const sanitizedMessages = messages
      .filter((m: any) => m.role !== "tool")
      .map((m: any) => {
        if (m.role === "assistant" && m.content && /!\[.*?\]\(https?:\/\//.test(m.content)) {
          const cleaned = m.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi, "[foto já enviada anteriormente]");
          return { ...m, content: cleaned };
        }
        return m;
      });

    // Inject client phone context if available (for calendar booking)
    const clientPhoneContext = external_user_id
      ? `\n\n[TELEFONE DO CLIENTE] O número de telefone/WhatsApp do cliente nesta conversa é: ${external_user_id}. Use este número ao agendar visitas (campo telefone_cliente).`
      : "";
    const fullMessages = [{ role: "system", content: systemPrompt + clientPhoneContext }, ...sanitizedMessages];
    const latestUserText = String(lastUserMsg?.content || "");

    debugTrace.push({ type: "config", model, temperature, top_p, top_k, tools_count: openaiTools?.length || 0, latest_user_text: latestUserText.slice(0, 120) });

    // ===== PHASE 1: TOOL DISPATCHER =====
    const toolResultsContext: string[] = [];
    let dispatcherHint = ""; // Captures dispatcher's conversational text when no tools are called

    // All tool dispatch decisions are made solely by the dispatcher LLM — no regex overrides.

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

        // OVERRIDE: If the message mentions scheduling/agenda topics, ALWAYS dispatch to tools
        // so the agent has real calendar data instead of hallucinating confirmations
        const schedulingKeywords = /\b(agend|horario|horário|visita|test.?drive|marcar|marcad|reserv|cancelar|desmarcar|reagend|confirma|agendar)\b/i;
        const mentionsScheduling = schedulingKeywords.test(normalizedLatestUser);

        // OVERRIDE: If contextual photo acceptance detected, ALWAYS dispatch
        const contextualPhotoAccept = isContextualPhotoAcceptance(latestUserText, sanitizedMessages);
        if (contextualPhotoAccept) {
          console.log(`[Dispatcher] Contextual photo acceptance detected — forcing dispatch: "${latestUserText.slice(0, 80)}"`);
        }

        const shouldSkip = (isContestationMsg || isConfirmationQuestion || isReactingToPreviousResponse || isSelectingPreviousOption) && !mentionsScheduling && !contextualPhotoAccept;

        if (shouldSkip) {
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
          if (mentionsScheduling && !shouldSkip) {
            console.log(`[Dispatcher] Scheduling context detected — forcing dispatch despite skip signals: "${latestUserText.slice(0, 80)}"`);
          }

        // Inject current Brasilia datetime into dispatcher system prompt
        const nowBrasilia = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
        const tomorrowDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowISO = tomorrowDate.toISOString().split("T")[0];
        const tomorrowWeekday = tomorrowDate.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
        const dateContext = `\n\n═══════════════════════════════════════════════\nCONTEXTO TEMPORAL (OBRIGATÓRIO — USE ESTAS DATAS)\n═══════════════════════════════════════════════\nAgora: ${nowBrasilia} (Horário de Brasília)\nHoje: ${todayISO}\nAmanhã: ${tomorrowISO} (${tomorrowWeekday})\n\nQUANDO o cliente disser "amanhã", use a data ${tomorrowISO}.\nQUANDO o cliente disser "hoje", use a data ${todayISO}.\nSEMPRE passe a data no formato YYYY-MM-DD no campo "date" da ferramenta.\nNUNCA invente datas. Use SOMENTE as datas calculadas acima.`;

        // Inject client phone into dispatcher so it can populate telefone_cliente
        const phoneContext = external_user_id
          ? `\n\n[TELEFONE DO CLIENTE] ${external_user_id} — use como telefone_cliente ao agendar.`
          : "";

        const dispatcherMessages = [
          { role: "system", content: dispatcherSystemPrompt + dateContext + phoneContext },
          ...sanitizedMessages,
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
              // Capture dispatcher's conversational text as hint for Phase 2
              const dispatcherText = String(dispatchMsg.content || "").trim();
              if (dispatcherText && dispatcherText !== "NO_TOOLS_NEEDED" && dispatcherText.length > 10) {
                dispatcherHint = dispatcherText;
                console.log(`[Dispatcher] No tools needed — captured hint (${dispatcherHint.length} chars): "${dispatcherHint.slice(0, 120)}"`);
                debugTrace.push({ type: "dispatcher_hint_captured", hint_length: dispatcherHint.length, hint_preview: dispatcherHint.slice(0, 200), timestamp: Date.now() });
              } else {
                console.log("[Dispatcher] No tools needed, no usable hint text");
              }
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
                (t) => sanitizeToolName(t.function_def?.name || t.name) === toolName
              );

              let toolResult: string;
              if (matchedTool) {
                // No regex-based overrides — dispatcher LLM is trusted completely.

                console.log(`[Dispatcher] Executing: ${toolName} (${matchedTool.tool_type}) args:`, JSON.stringify(toolArgs));
                debugTrace.push({ type: "tool_call", tool: toolName, tool_type: matchedTool.tool_type, args: toolArgs, timestamp: Date.now() });
                toolResult = await executeTool(matchedTool, toolArgs, supabase, agent_id, latestUserText, sanitizedMessages, { convId, externalUserId: external_user_id });

                let resultPreview: any = {};
                try {
                  const parsed = JSON.parse(toolResult);
                  if (matchedTool.tool_type === "fipe_query") {
                    resultPreview = { marca: parsed.marca, modelo: parsed.modelo, ano: parsed.ano, preco: parsed.resultado?.price, error: parsed.error };
                  } else {
                    resultPreview = { total: parsed.total, vehicle_count: parsed.vehicles?.length, hint: parsed._hint, error: parsed.error, message: parsed.message };
                  }
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
                    const { error: saveToolErr } = await saveMessageWithFallback({
                      p_agent_id: agent_id,
                      p_conversation_id: convId,
                      p_role: "tool",
                      p_content: toolResult,
                      p_model: null,
                      p_tokens_input: 0,
                      p_tokens_output: 0,
                      p_latency_ms: null,
                      p_metadata: null,
                    }, "SaveTool");
                    if (saveToolErr) console.warn("[SaveTool] FAILED:", saveToolErr.message);
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
      // VEHICLE MENTION FALLBACK removed — dispatcher LLM is the sole decision-maker.
      // If the dispatcher doesn't call a tool, we trust that decision.

      // FIPE APPRAISAL FALLBACK removed — dispatcher LLM handles FIPE calls.
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

    // Build list of vehicles that already had photos sent in this conversation (anti re-offer)
    const sentPhotoVehicles: string[] = [];
    const photoMarkerPattern = /\[foto já enviada(?: anteriormente)?\]/i;
    const vehiclePattern = /\b(Audi|Toyota|Honda|Volkswagen|VW|Chevrolet|Fiat|Hyundai|Kia|Ford|Jeep|Nissan|BMW|Mercedes|Porsche|Renault|Peugeot|Citroën|JAC|Caoa|Chery|Haval|Jetta|Virtus|T-Cross|Nivus|Tracker|Creta|Compass|Renegade)\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\b/gi;
    for (const msg of conversationalMessages) {
      if (msg.role === "assistant" && msg.content && photoMarkerPattern.test(msg.content)) {
        const beforeMarker = msg.content.split(photoMarkerPattern)[0] || "";
        let m: RegExpExecArray | null;
        vehiclePattern.lastIndex = 0;
        while ((m = vehiclePattern.exec(beforeMarker)) !== null) {
          const name = `${m[1]} ${m[2]}`.trim();
          if (name && !sentPhotoVehicles.includes(name)) sentPhotoVehicles.push(name);
        }
      }
    }

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
        // Check if any result is from FIPE (appraisal context)
        const hasFipeResult = toolResultsContext.some(ctx => ctx.includes('consultar_fipe'));
        const hasInventoryResult = toolResultsContext.some(ctx => ctx.includes('consultar_estoque'));
        
        let contextHeader: string;
        if (hasFipeResult && !hasInventoryResult) {
          contextHeader = `⚠️ RESULTADO DA CONSULTA FIPE — DADOS REAIS — PRIORIDADE MÁXIMA:
Os dados abaixo são o resultado REAL da consulta à tabela FIPE para o veículo do cliente.

REGRAS OBRIGATÓRIAS:
1. USE estes dados para informar o valor de referência ao cliente.
2. NUNCA diga "vou consultar", "chamada da ferramenta", "consultando" — os dados JÁ ESTÃO AQUI. Apresente DIRETAMENTE.
3. NUNCA mencione "consultar_fipe", "fipe_query", "ferramenta" ou qualquer nome técnico. Fale naturalmente: "O valor de referência na tabela FIPE..."
4. Aplique a regra de deságio: valor de compra/troca = FIPE - R$8.000 a R$12.000.
5. Complemente: "Mas o valor certinho a gente só consegue passar presencialmente."`;
        } else if (hasFipeResult && hasInventoryResult) {
          contextHeader = `⚠️ DADOS REAIS OBTIDOS — PRIORIDADE MÁXIMA:
Resultados da FIPE (veículo do cliente) e do estoque (veículos da loja) abaixo.
NUNCA mencione nomes de ferramentas. Apresente os dados naturalmente.
Para FIPE: aplique deságio de R$8.000 a R$12.000 abaixo do valor.
Para estoque: liste as opções disponíveis.`;
        } else {
          contextHeader = `⚠️ DADOS REAIS OBTIDOS AGORA DAS FERRAMENTAS — PRIORIDADE MÁXIMA:
Estes são dados REAIS e ATUALIZADOS do sistema. Você DEVE basear sua resposta EXCLUSIVAMENTE nestes dados.
NUNCA contradiga, ignore ou invente informações diferentes destes resultados.
Se a ferramenta retornou veículos, eles EXISTEM no estoque. NUNCA diga que não tem um veículo se ele aparece nos dados abaixo.
Se "total" >= 1, o veículo ESTÁ DISPONÍVEL.`;
        }

        toolContextMsg = `${contextHeader}

${toolResultsContext.join("\n\n")}`;
      }

      // Append photo memory when we have vehicles that already had photos sent (anti re-offer)
      if (sentPhotoVehicles.length > 0) {
        toolContextMsg += `\n\n⚠️ FOTOS JÁ ENVIADAS NESTA CONVERSA: ${sentPhotoVehicles.join(", ")}. NÃO ofereça enviar fotos desses veículos novamente — elas já foram entregues ao cliente.`;
      }

      // Insert just before the last user message for maximum LLM attention
      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx > 0) {
        conversationalMessages.splice(lastUserIdx, 0, { role: "system", content: toolContextMsg });
      } else {
        conversationalMessages.splice(1, 0, { role: "system", content: toolContextMsg });
      }
      console.log(`[Conversational] Injecting ${toolResultsContext.length} tool result(s) as context (position: before last user msg, empty=${allToolsReturnedEmpty})`);
    } else if (sentPhotoVehicles.length > 0) {
      // No tool results this turn, but we have vehicles with photos already sent — inject memory note
      const photoMemoryNote = `⚠️ FOTOS JÁ ENVIADAS NESTA CONVERSA: ${sentPhotoVehicles.join(", ")}. NÃO ofereça enviar fotos desses veículos novamente — elas já foram entregues ao cliente.`;
      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx > 0) {
        conversationalMessages.splice(lastUserIdx, 0, { role: "system", content: photoMemoryNote });
      } else {
        conversationalMessages.splice(1, 0, { role: "system", content: photoMemoryNote });
      }
      console.log(`[Conversational] Injected photo memory (${sentPhotoVehicles.length} vehicles already had photos sent)`);
    }

    // ===== DISPATCHER HINT INJECTION =====
    // When the dispatcher generated useful conversational text but no tools were called,
    // inject it as guidance so Gemini produces a coherent, aligned response instead of diverging.
    if (dispatcherHint && toolResultsContext.length === 0) {
      const hintMsg = `⚠️ ORIENTAÇÃO DO SISTEMA (PRIORIDADE ALTA):
O sistema analisou a mensagem do cliente e sugeriu a seguinte abordagem de resposta:
"${dispatcherHint}"

REGRAS:
1. Use esta orientação como BASE para sua resposta — mantenha a mesma INTENÇÃO e DIREÇÃO.
2. Reformule com seu tom natural e humanizado, mas NÃO contradiga a sugestão acima.
3. NÃO copie o texto literalmente — adapte ao seu estilo conversacional.
4. NÃO mencione "sistema", "orientação", "sugestão" ou qualquer referência técnica interna.
5. NÃO invente dados, preços ou disponibilidade que não estejam no histórico da conversa.
6. NÃO use comandos técnicos como ENVIAR_FOTOS, TOOL_CALL, etc.
7. NÃO retorne JSON, objetos de ação, ou qualquer formato estruturado. Responda SOMENTE com texto natural.`;

      const lastUserIdx = conversationalMessages.map((m: any) => m.role).lastIndexOf("user");
      if (lastUserIdx > 0) {
        conversationalMessages.splice(lastUserIdx, 0, { role: "system", content: hintMsg });
      } else {
        conversationalMessages.splice(1, 0, { role: "system", content: hintMsg });
      }
      console.log(`[Conversational] Injected dispatcher hint as guidance (${dispatcherHint.length} chars)`);
      debugTrace.push({ type: "dispatcher_hint_injected", hint_length: dispatcherHint.length, timestamp: Date.now() });
    }

    // ===== ANTI-JSON GUARD FOR PHASE 2 =====
    // Inject explicit instruction to NEVER output JSON/action objects
    const antiJsonGuard = {
      role: "system",
      content: `⚠️ REGRA ABSOLUTA DE FORMATO:
Sua resposta DEVE ser APENAS texto natural em português, como uma conversa humana no WhatsApp.
NUNCA retorne JSON, objetos como {"action": ...}, {"tool": ...}, {"consultar_estoque": ...} ou qualquer formato estruturado.
NUNCA tente executar ferramentas ou ações — isso já foi feito. Apenas converse naturalmente.
Se você sentir vontade de retornar um JSON ou chamar uma ferramenta, PARE e escreva uma frase natural no lugar.`,
    };
    // Insert right before the system prompt (position 1, after the main system prompt)
    conversationalMessages.splice(1, 0, antiJsonGuard);

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

    // Call the agent's configured LLM — NO tools passed (dispatcher already handled them)
    // CRITICAL FIX: Gemini 3 preview models silently drop "system" AND "developer" role messages
    // via OpenAI-compatible API (prompt tokens ~120 for a 32K prompt = ignored).
    // Workaround: Merge ALL system messages into a single "user" message at the start,
    // followed by a brief "assistant" acknowledgment, so Gemini processes the instructions.
    let finalConversationalMessages: any[];
    if (isGemini) {
      // CRITICAL FIX: Gemini drops "system" role messages via OpenAI-compatible API.
      // Workaround: Merge system messages into a "user" + "assistant" pair at the start.
      // BUT: Tool context and dispatcher hints injected near the last user message must
      // STAY near the last user message (converted to "user" role) — otherwise Gemini 2.0 Flash
      // ignores them because they're buried in a 16K+ token block at the start.

      const systemMsgs: any[] = [];
      const criticalContextMsgs: any[] = []; // These stay near last user msg
      const nonSystemMsgs: any[] = [];

      for (const m of conversationalMessages) {
        if (m.role === "system") {
          // Detect if this is a tool context, dispatcher hint, or photo memory msg
          const content = String(m.content || "");
          const isCriticalContext = content.includes("PRIORIDADE MÁXIMA") ||
            content.includes("PRIORIDADE ALTA") ||
            content.includes("ORIENTAÇÃO DO SISTEMA") ||
            content.includes("CONTINUIDADE DE CONTEXTO") ||
            content.includes("FOTOS JÁ ENVIADAS") ||
            content.includes("DADOS REAIS OBTIDOS");
          if (isCriticalContext) {
            criticalContextMsgs.push(m);
          } else {
            systemMsgs.push(m);
          }
        } else {
          nonSystemMsgs.push(m);
        }
      }

      const mergedSystemContent = systemMsgs.map((m: any) => m.content).join("\n\n---\n\n");

      finalConversationalMessages = [
        { role: "user", content: `[INSTRUÇÕES DO SISTEMA — SIGA RIGOROSAMENTE]\n\n${mergedSystemContent}\n\n[FIM DAS INSTRUÇÕES — Responda como a persona descrita acima]` },
        { role: "assistant", content: "Entendido. Vou seguir todas as instruções acima rigorosamente, mantendo a persona e as regras definidas." },
      ];

      // Re-insert non-system messages, injecting critical context as "user" msgs 
      // right before the last user message to maximize Gemini's attention
      if (criticalContextMsgs.length > 0) {
        const lastUserIdx = nonSystemMsgs.map((m: any) => m.role).lastIndexOf("user");
        if (lastUserIdx > 0) {
          // Insert critical context as user messages right before last user msg
          for (let i = 0; i < criticalContextMsgs.length; i++) {
            const ctxContent = criticalContextMsgs[i].content;
            nonSystemMsgs.splice(lastUserIdx + i, 0, {
              role: "user",
              content: `[CONTEXTO TÉCNICO REAL — LEIA COM ATENÇÃO]\n${ctxContent}\n[FIM DO CONTEXTO — Responda ao cliente usando ESTES DADOS]`,
            });
            // Add a brief assistant ack so the conversation alternates properly
            nonSystemMsgs.splice(lastUserIdx + i + 1, 0, {
              role: "assistant",
              content: "Entendido, vou usar esses dados reais na minha resposta.",
            });
          }
        } else {
          // Fallback: append before all non-system messages
          for (const ctx of criticalContextMsgs) {
            finalConversationalMessages.push({
              role: "user",
              content: `[CONTEXTO TÉCNICO REAL]\n${ctx.content}`,
            });
            finalConversationalMessages.push({
              role: "assistant",
              content: "Entendido, vou usar esses dados reais.",
            });
          }
        }
      }

      finalConversationalMessages.push(...nonSystemMsgs);
      console.log(`[Conversational] Gemini system-as-user workaround: merged ${systemMsgs.length} system msgs (${mergedSystemContent.length} chars), preserved ${criticalContextMsgs.length} critical context msg(s) near last user msg`);
    } else {
      finalConversationalMessages = conversationalMessages;
    }

    console.log(`[Conversational] Calling ${provider.name}, model: ${model}, url: ${baseUrl}, messages: ${finalConversationalMessages.length}`);

    const convResp = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: finalConversationalMessages,
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
    const photoCommandLine = (rawContent.match(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s]+(.+)$/im)?.[1] || "").trim();

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

    // POST-PROCESSING: Strip emojis for tenants that prohibit them
    const noEmojiTenants = ["instituto-vicentim-maekawa", "insituto-vicentim-maekawa", "ppl-motors", "ppl-mortors", "pet-home"];
    if (noEmojiTenants.includes(tenantSlug || "")) {
      const before = finalContent;
      finalContent = stripEmojis(finalContent);
      if (before !== finalContent) {
        console.log("[PostProcess] Stripped emojis from response for tenant:", tenantSlug);
      }
    }

    // FALLBACK: if LLM returned empty response, provide a sensible default
    if (!finalContent.trim()) {
      console.warn("[Conversational] LLM returned EMPTY response — applying fallback");
      debugTrace.push({ type: "empty_response_fallback", model, has_dispatcher_hint: !!dispatcherHint, timestamp: Date.now() });

      if (dispatcherHint) {
        // Use the dispatcher's hint as the basis — it already has the right intent
        finalContent = dispatcherHint;
        console.log(`[Conversational] Using dispatcher hint as fallback (${dispatcherHint.length} chars)`);
      } else if (imageBase64Parts.length > 0) {
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
    // AND NOT when the conversation is about trade-in/appraisal (user talking about THEIR car)
    const isAppraisalPhotoContext = imageBase64Parts.length > 0 && !(latestUserText || "").trim();
    const isTradeInContext = /(troca|trocar|negocio|negócio|dar na troca|meu carro|tenho um|avalia|pré-avalia|pre-avalia|quanto vale o meu|dar como entrada|colocar na negociação|aceita|aceitam)/i.test(latestUserText || "");
    const isSchedulingContext = /(agend|reagend|remar|horario|horário|visita|test.?drive|marcar|remarcar|quero ir|posso ir|vou aí|vou ai|chegar na loja|estacionamento|endere[cç]o|como chego)/i.test(latestUserText || "");
    const hasFipeResult = toolResultsContext.some(ctx => /fipe|tabela_fipe|valor_fipe|preco_medio/i.test(ctx));
    // PHOTO INJECTION: Only inject photos when user EXPLICITLY asked for them
    // Must match the same expanded regex from inventory_query to be consistent
    const userExplicitlyAskedPhotos = /\b(fotos?|imagens?|photos?|mand[ae]r?\s*fotos?|envia(?:r)?\s*fotos?|ver\s*fotos?|mostra(?:r)?\s*fotos?|me\s*envia(?:r)?|me\s*mand[ae]r?|pode\s*me\s*mand[ae]r?|galeria)\b/i.test(latestUserText || "")
      || /\b(me\s*mand[ae]r?|pode\s*me\s*mand[ae]r?|me\s*envia(?:r)?|pode\s*me\s*envia(?:r)?)\b.*\b(tamb[eé]m|tb|tbm|tamb[eé]n)\b/i.test(latestUserText || "")
      || isContextualPhotoAcceptance(latestUserText || "", sanitizedMessages || []);
    if (toolResultsContext.length > 0 && !isAppraisalPhotoContext && !isTradeInContext && !isSchedulingContext && userExplicitlyAskedPhotos) {
      try {
        for (const ctx of toolResultsContext) {
          const parsed = JSON.parse(ctx.replace(/^\[Resultado da ferramenta "[^"]+"\]: /, ""));
          if (parsed?.vehicles && Array.isArray(parsed.vehicles)) {
            finalContent = appendMissingVehiclePhotos(finalContent, parsed.vehicles, latestUserText, true);
            console.log(`[PostProcess] appendMissingVehiclePhotos applied (user requested photos), vehicles=${parsed.vehicles.length}`);
          }
        }
      } catch (e: any) {
        console.warn("[PostProcess] Could not extract vehicles for photo injection:", e?.message);
      }
    } else if (!isAppraisalPhotoContext && !isTradeInContext && !isSchedulingContext && toolResultsContext.length === 0 && agent?.tenant_id) {
      const explicitPhotoRequest = /(foto|fotos|imagem|imagens|mand[ae]r?|envia(?:r)?|nao me enviou|não me enviou|cad[eê]\s*(as\s+fotos|\?|$)|me envia(?:r)?|me mand[ae]r?|pode me mand[ae]r?)/i.test(latestUserText || "")
        || /\b(me\s*mand[ae]r?|pode\s*me\s*mand[ae]r?)\b.*\b(tamb[eé]m|tb|tbm)\b/i.test(latestUserText || "")
        || isContextualPhotoAcceptance(latestUserText || "", sanitizedMessages || []);
      const shouldForcePhotoRecovery = !hasMarkdownImages(finalContent) && (!!photoCommandLine || explicitPhotoRequest);

      if (shouldForcePhotoRecovery) {
        // Fallback: user asked for photos, but dispatcher called no tools (NO_TOOLS_NEEDED).
        // Recover likely vehicle(s) from inventory using command ID or recent conversation context.
        try {
          const idFromCommand = photoCommandLine.match(/\bid:\s*([0-9a-f-]{36})\b/i)?.[1] || null;
          const contextWindow = [
            photoCommandLine,
            latestUserText,
            ...(sanitizedMessages || []).slice(-8).map((m: any) => String(m?.content || "")),
          ].join(" ");
          const normalizedContext = contextWindow
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, " ");

          let fallbackVehicles: any[] = [];

          if (idFromCommand) {
            const { data, error } = await supabase
              .from("inventory")
              .select("*")
              .eq("tenant_id", agent.tenant_id)
              .eq("status", "available")
              .eq("id", idFromCommand)
              .limit(1);
            if (error) {
              console.warn("[PostProcess] Photo fallback by id failed:", error.message);
            } else {
              fallbackVehicles = data || [];
            }
          } else {
            const { data: pool, error: poolErr } = await supabase
              .from("inventory")
              .select("*")
              .eq("tenant_id", agent.tenant_id)
              .eq("status", "available")
              .limit(120);

            if (poolErr) {
              console.warn("[PostProcess] Photo fallback inventory pool failed:", poolErr.message);
            } else if (pool && pool.length > 0) {
              const scoreVehicle = (v: any) => {
                let score = 0;
                const hay = `${v?.brand || ""} ${v?.model || ""} ${v?.version || ""}`
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, " ");
                const tokens = hay.split(/\s+/).filter((t: string) => t.length >= 3);
                score += tokens.reduce((acc: number, token: string) => acc + (normalizedContext.includes(token) ? 1 : 0), 0);
                if (v?.year && normalizedContext.includes(String(v.year))) score += 3;
                return score;
              };

              const ranked = [...pool]
                .map((v: any) => ({ v, score: scoreVehicle(v) }))
                .filter((x: any) => x.score > 0)
                .sort((a: any, b: any) => b.score - a.score);

              fallbackVehicles = ranked.slice(0, 3).map((x: any) => x.v);
            }
          }

          if (fallbackVehicles.length > 0) {
            finalContent = appendMissingVehiclePhotos(finalContent, fallbackVehicles, latestUserText || contextWindow, true);
            console.log(`[PostProcess] Photo fallback applied from context, vehicles=${fallbackVehicles.length}, by_id=${!!idFromCommand}`);
            debugTrace.push({ type: "photo_fallback_from_context", vehicles: fallbackVehicles.length, has_id: !!idFromCommand, explicit_photo_request: explicitPhotoRequest, timestamp: Date.now() });
          } else {
            console.warn(`[PostProcess] Photo fallback found no candidate vehicles (request='${latestUserText}')`);
          }
        } catch (e: any) {
          console.warn("[PostProcess] Photo fallback error:", e?.message);
        }
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

    // Strip ALL bold/italic markdown formatting from final content (client must see plain text only)
    if (finalContent) {
      // Remove **bold** → bold, *italic* → italic (but NOT image markdown ![...](url))
      finalContent = finalContent.replace(/\*\*(.+?)\*\*/g, '$1');  // **bold** → bold
      finalContent = finalContent.replace(/(?<!!)\*([^*\n]+?)\*/g, '$1');  // *italic* → italic (not ![img])
      finalContent = finalContent.replace(/__(.+?)__/g, '$1');  // __bold__ → bold
      finalContent = finalContent.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '$1');  // _italic_ → italic
    }

    // ===== HANDOFF DETECTION — cancel follow-ups + send notification =====
    // If raw content contained HANDOFF_COMERCIAL or the LLM mentioned transferring to a human,
    // proactively cancel follow-ups and send a team notification (safety net for when LLM
    // uses the legacy text command instead of calling chatwoot_assign + send_notification tools)
    const handoffDetected = /HANDOFF_COMERCIAL/i.test(rawContent) ||
      /\b(vou te transferir|vou transferir|vou encaminhar|um (consultor|especialista|vendedor|atendente) (vai|irá) (assumir|continuar|dar sequência)|nosso time (vai|irá) (entrar em contato|continuar))\b/i.test(finalContent);
    
    // Only trigger if the dispatcher did NOT already call chatwoot_assign (avoid double action)
    const dispatcherCalledAssign = debugTrace.some((t: any) => t.type === "tool_result" && t.tool === "chatwoot_assign");
    
    if (handoffDetected && !dispatcherCalledAssign && convId && agent_id) {
      console.log(`[Handoff→Post] Detected handoff in response — cancelling follow-ups + sending notification`);
      
      // Cancel follow-ups
      try {
        await supabase.rpc("cancel_pending_followups", { p_agent_id: agent_id, p_conversation_id: convId });
        console.log(`[Handoff→Post] Cancelled follow-ups for conv ${convId}`);
      } catch (e) { console.warn("[Handoff→Post] Cancel follow-ups error:", e); }
      
      // Send notification to team group
      try {
        const { data: agentToolRows } = await supabase
          .from("agent_tools")
          .select("tool_id, tools(id, tool_type, execution_config)")
          .eq("agent_id", agent_id);
        const notifyToolRow = agentToolRows?.find((at: any) => at.tools?.tool_type === "send_notification");
        
        if (notifyToolRow?.tools) {
          const nCfg = (notifyToolRow.tools.execution_config || {}) as Record<string, any>;
          const targetCwCid = nCfg.conversation_id || nCfg.chatwoot_conversation_id || nCfg.group_conversation_id;
          
          if (targetCwCid) {
            const { data: agCfgH } = await supabase.from("agents").select("config").eq("id", agent_id).single();
            const cfgH = (agCfgH?.config || {}) as Record<string, any>;
            const cwUrlH = cfgH.chatwoot_url;
            const cwTokenH = cfgH.chatwoot_api_token;
            const cwAccIdH = cfgH.chatwoot_account_id;
            
            if (cwUrlH && cwTokenH && cwAccIdH) {
              // Build a brief summary from the last few messages
              const recentMsgs = (sanitizedMessages || []).slice(-6);
              const summaryLines = recentMsgs
                .filter((m: any) => m.role === "user")
                .map((m: any) => m.content?.slice(0, 100))
                .filter(Boolean)
                .slice(-3);
              const briefSummary = summaryLines.join(" | ") || "Sem resumo disponível";
              const extUser = external_user_id || "N/A";
              
              // Try to extract client name from conversation
              let clientName = "Não identificado";
              for (const m of recentMsgs) {
                if (m.role === "assistant" && m.content) {
                  const nameMatch = m.content.match(/(?:prazer|obrigad[oa]),?\s+([A-ZÀ-Ú][a-zà-ú]+)/);
                  if (nameMatch) { clientName = nameMatch[1]; break; }
                }
              }
              
              const notifMsg = `🙋 [LEAD AGUARDANDO ATENDIMENTO HUMANO]\n\nCliente: ${clientName}\nTelefone: ${extUser}\nResumo: ${briefSummary}\n\nO lead solicitou atendimento humano e está aguardando.`;
              
              console.log(`[Handoff→Notify] Sending to CW conv ${targetCwCid}`);
              const nResp = await fetch(`${cwUrlH.replace(/\/+$/, "")}/api/v1/accounts/${cwAccIdH}/conversations/${targetCwCid}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", api_access_token: cwTokenH },
                body: JSON.stringify({ content: notifMsg, message_type: "outgoing", private: false }),
              });
              console.log(`[Handoff→Notify] Status: ${nResp.status}`);
            }
          }
        }
      } catch (e) { console.warn("[Handoff→Notify] Error (non-blocking):", e); }
      
      debugTrace.push({ type: "handoff_post_processing", cancelled_followups: true, notification_sent: true, timestamp: Date.now() });
    }

    // Save to memory — split into separate messages to match WhatsApp delivery
    const messageParts = splitIntoMessages(finalContent);
    if (convId && finalContent) {
      const latency = Date.now() - startTime;
      try {
        for (let i = 0; i < messageParts.length; i++) {
          const { error: saveAssistantErr } = await saveMessageWithFallback({
            p_agent_id: agent_id,
            p_conversation_id: convId,
            p_role: "assistant",
            p_content: messageParts[i],
            p_model: model,
            p_latency_ms: i === 0 ? latency : null,
            p_metadata: i === 0 ? { debug: debugTrace, edge_logs: collectedLogs } : null,
          }, "SaveAssistant");
          if (saveAssistantErr) throw saveAssistantErr;
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
