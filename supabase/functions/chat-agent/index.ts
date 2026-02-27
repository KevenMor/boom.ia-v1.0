import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Remove other common tool artifact patterns
  text = text.replace(/^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/gmi, "");
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
    try {
      const decoded = JSON.parse(vehicle.photos);
      if (Array.isArray(decoded)) {
        parsedPhotos = decoded.filter((p: unknown) => typeof p === "string") as string[];
      }
    } catch {
      // ignore invalid JSON
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

  // Rank vehicles by token overlap with user context and pick best match
  const normalizedContext = userContext
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const scoreVehicle = (v: any) => {
    const hay = `${v?.brand || ""} ${v?.model || ""} ${v?.version || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const tokens = hay.split(/\s+/).filter((t) => t.length >= 3);
    return tokens.reduce((acc, token) => acc + (normalizedContext.includes(token) ? 1 : 0), 0);
  };

  const ranked = [...vehicles].sort((a, b) => scoreVehicle(b) - scoreVehicle(a));
  const targetVehicle = ranked[0] || vehicles[0];

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
  ]);

  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t));

  const args: Record<string, any> = {};
  if (yearMatch) args.year = Number(yearMatch[0]);
  if (tokens.length > 0) args.search = tokens.slice(0, 4).join(" ");
  else args.search = normalized.trim().slice(0, 80);

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
  const isAffirmativeOnly = /^(sim|claro|ok|pode|pode sim|pode ser|com certeza|por favor|por gentileza|gentileza|manda|mande|envie|quero|show|bora|vamos|yes|please|ss+|sii+m?)$/i.test(
    normalizedUser
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
    if (msg.role !== "assistant") continue;

    const rawContent = String(msg.content || "");
    const normalizedContent = rawContent
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    for (const brand of knownBrands) {
      const pattern = new RegExp(`\\b${escapeRegExp(brand)}\\b\\s+([a-z0-9][a-z0-9./-]*(?:\\s+[a-z0-9][a-z0-9./-]*){0,4})`, "gi");
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(normalizedContent)) !== null) {
        const model = (m[1] || "").trim();
        if (!model) continue;
        const full = `${brand} ${model}`.trim();
        vehicleMentions.push({ brand, model, full, sourceIndex: idx });
      }
    }
  }

  if (!vehicleMentions.length) return null;

  // If user answered only with a polite affirmative, assume latest discussed vehicle
  if (isAffirmativeOnly) {
    const latestMention = vehicleMentions[vehicleMentions.length - 1];
    const modelFirstWord = latestMention.model.split(/\s+/)[0] || latestMention.model;
    return { search: modelFirstWord };
  }

  const userTokens = normalizedUser
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t) && !/^\d+$/.test(t));

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
    const modelFirstWord = bestMatch.model.split(/\s+/)[0] || bestMatch.model;
    return { search: modelFirstWord };
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

function splitIntoMessages(content: string): string[] {
  // Separate photo blocks from text
  const photoRegex = /!\[.*?\]\(https?:\/\/[^\s)]+\)/g;
  const photos: string[] = [];
  const textOnly = content.replace(photoRegex, (match) => {
    photos.push(match);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();

  const textParts: string[] = [];

  if (textOnly.trim()) {
    const paragraphs = textOnly.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
      for (const para of paragraphs) {
        textParts.push(para);
      }
    } else {
      textParts.push(textOnly.trim());
    }
  }

  // Build final order: text paragraphs → photos → closing question
  // Detect if the last text paragraph is a closing question and move it after photos
  const parts: string[] = [];
  let closingPart: string | null = null;

  if (photos.length > 0 && textParts.length > 1) {
    const lastText = textParts[textParts.length - 1];
    if (isClosingQuestion(lastText)) {
      closingPart = lastText;
      // Add all text EXCEPT the closing question
      for (let i = 0; i < textParts.length - 1; i++) {
        parts.push(textParts[i]);
      }
    } else {
      parts.push(...textParts);
    }
  } else {
    parts.push(...textParts);
  }

  // Photos in batches of 3
  for (let i = 0; i < photos.length; i += 3) {
    parts.push(photos.slice(i, i + 3).join("\n"));
  }

  // Closing question AFTER photos
  if (closingPart) {
    parts.push(closingPart);
  }

  const allParts = parts.length ? parts : [content];

  // Aggressive dedup
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

async function executeTool(tool: ToolDef, args: Record<string, any>, supabase: any, agentId: string): Promise<string> {
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
        if (brandArg) query = query.or(`brand.ilike.%${brandArg}%,model.ilike.%${brandArg}%,version.ilike.%${brandArg}%,description.ilike.%${brandArg}%`);
        if (modelArg) query = query.or(`model.ilike.%${modelArg}%,version.ilike.%${modelArg}%,brand.ilike.%${modelArg}%,description.ilike.%${modelArg}%`);
        if (args.search || args.query || args.termo) {
          const term = args.search || args.query || args.termo;
          query = query.or(`brand.ilike.%${term}%,model.ilike.%${term}%,version.ilike.%${term}%,description.ilike.%${term}%,color.ilike.%${term}%`);
        }
        if (args.year || args.ano) query = query.eq("year", args.year || args.ano);
        if (args.fuel_type || args.fuel || args.combustivel) query = query.ilike("fuel_type", `%${args.fuel_type || args.fuel || args.combustivel}%`);
        if (args.transmission || args.cambio) query = query.ilike("transmission", `%${args.transmission || args.cambio}%`);
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

        const isListing = data.length > 3;

        return JSON.stringify({
          total: data.length,
          _hint: isListing
            ? `Apresente cada veículo em um PARÁGRAFO SEPARADO (separado por linha em branco). Use linguagem natural de vendedor WhatsApp. Comece com saudação, depois um veículo por parágrafo, e finalize com pergunta. Apresente TODOS os ${data.length} veículos. NÃO use listas numeradas.`
            : "Veículo específico. Inclua TODAS as fotos do array 'photos'.",
          vehicles: data.map((v: any) => {
            if (isListing) {
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

            // Specific vehicle: include all photos
            let parsedPhotos: string[] = [];
            if (Array.isArray(v.photos)) {
              parsedPhotos = v.photos.filter((p: unknown) => typeof p === "string") as string[];
            } else if (typeof v.photos === "string" && v.photos.trim()) {
              try {
                const decoded = JSON.parse(v.photos);
                if (Array.isArray(decoded)) {
                  parsedPhotos = decoded.filter((p: unknown) => typeof p === "string") as string[];
                }
              } catch {}
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

      default:
        return JSON.stringify({ error: `Unknown tool type: ${tool.tool_type}` });
    }
  } catch (e: any) {
    console.error(`Tool execution error (${tool.name}):`, e);
    return JSON.stringify({ error: e.message || "Tool execution failed" });
  }
}

// ---------- convert tools to OpenAI format ----------
function toolsToOpenAI(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.function_def?.name || t.name,
      description: t.function_def?.description || t.description || t.name,
      parameters: t.function_def?.parameters || { type: "object", properties: {} },
    },
  }));
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY");

    if (!encryptionKey || !nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("x-nexus-auth") || "";
    const supabase = createClient(nexusUrl, nexusKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { agent_id, messages, conversation_id } = await req.json();

    if (!agent_id || !messages?.length) {
      return new Response(JSON.stringify({ error: "agent_id and messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Load agent + provider + tenant settings
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("*, providers(name, base_url, api_key_encrypted), tenants(settings)")
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
    if (convId && lastUserMsg?.role === "user") {
      try {
        await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: convId,
          p_role: "user",
          p_content: lastUserMsg.content,
        });
      } catch (e) {
        console.warn("Could not save user message:", e);
      }
    }

    // 5. Determine endpoint
    const baseUrl = (provider.base_url && provider.base_url.includes("/chat/completions"))
      ? provider.base_url
      : PROVIDER_URLS[provider.name] || PROVIDER_URLS.OpenAI;

    // 6. Build request — merge tenant LLM config with agent defaults
    const isAnthropic = provider.name === "Anthropic";
    const isGemini = provider.name === "Google Gemini" || provider.name === "Gemini";
    const model = agent.model || "gpt-4o";
    const agentConfig = agent.config || {};
    const tenantSettings = agent.tenants?.settings || {};
    const llmConfig = tenantSettings.llm_config || {};
    // Priority: agent-level > tenant-level > defaults
    const temperature = agent.temperature ?? llmConfig.temperature ?? 0.7;
    const top_p = agentConfig.top_p ?? llmConfig.top_p ?? undefined;
    const top_k = agentConfig.top_k ?? llmConfig.top_k ?? undefined;
    const photoInstruction = agentTools.some(t => t.tool_type === "inventory_query")
      ? `\n\nREGRAS OBRIGATÓRIAS DE COMUNICAÇÃO (SDR humanizado):

FORMATO DE RESPOSTA PARA LISTAGEM DE VEÍCULOS:
Sua resposta DEVE ser separada em parágrafos distintos (separados por linha em branco) assim:

Parágrafo 1: Saudação calorosa + frase curta dizendo que encontrou opções.

Parágrafo 2: Primeiro veículo com detalhes (modelo, ano, preço, km, cor, câmbio) em 1-2 linhas naturais.

Parágrafo 3: Segundo veículo...

(continue um parágrafo por veículo)

Último parágrafo: Pergunta natural tipo "Algum desses te chamou atenção? Posso enviar fotos e mais detalhes!"

IMPORTANTE:
- Cada veículo em seu PRÓPRIO parágrafo, separado por linha em branco.
- Apresente TODOS os veículos retornados, sem omitir nenhum.
- Use linguagem natural e curta, como um vendedor no WhatsApp (não use listas numeradas, bullets ou formatação técnica).
- Exemplo de veículo: "Temos um Nivus 1.0 Highline 2024, branco, automático, com 39 mil km, por R$ 119.900 👀"
- NÃO inclua fotos na listagem.

REGRA CRÍTICA - FOTOS E DETALHES DE VEÍCULO ESPECÍFICO:
Quando o cliente pedir fotos, imagens, detalhes ou mais informações sobre um veículo específico, você DEVE OBRIGATORIAMENTE chamar a ferramenta consultar_estoque com filtros específicos (marca, modelo, ano, etc.) para obter os dados completos COM fotos. Você NÃO tem as fotos no contexto da listagem anterior. NUNCA responda sobre fotos sem antes chamar a ferramenta.
Após receber o resultado da ferramenta, inclua TODAS as fotos do array 'photos' usando: ![foto](URL)
Se 'photos' estiver vazio, use 'photo_url'.

PROIBIÇÕES:
- NUNCA escreva nomes de ferramentas no texto.
- NUNCA repita o mesmo conteúdo.
- NUNCA use formato de lista (1. 2. 3. ou • ou -).
- NUNCA responda sobre fotos sem chamar a ferramenta primeiro.
- Mostre fotos naturalmente, sem mencionar campos técnicos.`
      : "";
    const greetingInstruction = `\n\nCOMPORTAMENTO DE SAUDAÇÃO:
- Responda saudações ("bom dia", "boa tarde", "boa noite", "oi", "olá") de forma calorosa e profissional, retribuindo a saudação adequada.
- Após a saudação, apresente-se brevemente e pergunte como pode ajudar o cliente.
- Seja sempre cordial e humanizado.`;
    const systemPrompt = (agent.system_prompt || "You are a helpful AI assistant.") + photoInstruction + greetingInstruction;
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
                p_agent_id: agent_id, p_conversation_id: convId,
                p_role: "assistant", p_content: fullContent, p_model: model,
                p_latency_ms: latency,
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

    // ---------- OpenAI-compatible path with Function Calling ----------
    const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

    // Step 1: First call (non-streaming if tools, to handle tool_calls)
    if (openaiTools && openaiTools.length > 0) {
      console.log(`Calling with ${openaiTools.length} tools, model: ${model}`);

      let currentMessages = [...fullMessages];
      let maxIterations = 5; // Prevent infinite loops
      const userConversationText = messages
        .filter((m: any) => m.role === "user")
        .map((m: any) => String(m.content || ""))
        .join(" ")
        .toLowerCase();
      const latestUserText = String(lastUserMsg?.content || "");
      const userRequestedMediaOrDetails = isVehicleMediaOrDetailRequest(latestUserText);
      let lastInventoryVehicles: any[] = [];
      // Debug trace for sandbox
      const debugTrace: any[] = [];

      debugTrace.push({ type: "config", model, temperature, top_p, top_k, tools_count: openaiTools?.length || 0, latest_user_text: latestUserText.slice(0, 120), media_request_from_latest_user: userRequestedMediaOrDetails });

      while (maxIterations-- > 0) {
        const toolCallResp = await fetch(baseUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, messages: currentMessages, ...llmParams,
            tools: openaiTools, tool_choice: "auto",
            stream: false,
          }),
        });

        if (!toolCallResp.ok) {
          const t = await toolCallResp.text();
          console.error(`Provider error: ${toolCallResp.status}`, t);
          return new Response(JSON.stringify({ error: `Provider error: ${toolCallResp.status}`, detail: t }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const result = await toolCallResp.json();
        const choice = result.choices?.[0];

        if (!choice) {
          return new Response(JSON.stringify({ error: "No response from provider" }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const assistantMsg = choice.message;
        debugTrace.push({
          type: "llm_iteration",
          finish_reason: choice.finish_reason,
          has_tool_calls: !!assistantMsg.tool_calls?.length,
          tool_calls_count: assistantMsg.tool_calls?.length || 0,
          content_preview: String(assistantMsg.content || "").slice(0, 240),
          timestamp: Date.now(),
        });

        // If no tool calls, finalize response and run media recovery if needed
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          const inventoryTool = agentTools.find((t) => t.tool_type === "inventory_query");

          const rawContent = assistantMsg.content || "";
          let finalContent = sanitizeLLMOutput(rawContent);
          finalContent = dedupeRepeatedParagraphs(finalContent);

          if (userRequestedMediaOrDetails && lastInventoryVehicles.length > 0) {
            finalContent = appendMissingVehiclePhotos(finalContent, lastInventoryVehicles, latestUserText);
          }

          finalContent = removeRedundantPhotoOfferWhenPhotosPresent(finalContent);

          if (userRequestedMediaOrDetails && !hasMarkdownImages(finalContent) && inventoryTool) {
            const recoveryArgs = buildFallbackInventoryArgs(latestUserText || userConversationText, messages);
            console.log(`Forced media recovery via inventory_query: ${JSON.stringify(recoveryArgs)}`);

            debugTrace.push({
              type: "tool_call",
              tool: inventoryTool.function_def?.name || inventoryTool.name,
              tool_type: inventoryTool.tool_type,
              args: recoveryArgs,
              forced: true,
              reason: "final_response_without_images",
              timestamp: Date.now(),
            });

            const recoveryResult = await executeTool(inventoryTool, recoveryArgs, supabase, agent_id);

            try {
              const parsedRecovery = JSON.parse(recoveryResult);
              if (Array.isArray(parsedRecovery?.vehicles)) {
                lastInventoryVehicles = parsedRecovery.vehicles;
                finalContent = appendMissingVehiclePhotos(finalContent, lastInventoryVehicles, latestUserText);
                finalContent = removeRedundantPhotoOfferWhenPhotosPresent(finalContent);
              }

              debugTrace.push({
                type: "tool_result",
                tool: inventoryTool.function_def?.name || inventoryTool.name,
                preview: {
                  forced: true,
                  recovery: true,
                  total: parsedRecovery?.total,
                  vehicle_count: parsedRecovery?.vehicles?.length,
                  message: parsedRecovery?.message,
                  error: parsedRecovery?.error,
                },
                timestamp: Date.now(),
              });
            } catch {
              debugTrace.push({
                type: "tool_result",
                tool: inventoryTool.function_def?.name || inventoryTool.name,
                preview: { forced: true, recovery: true, raw_length: recoveryResult.length },
                timestamp: Date.now(),
              });
            }
          }
          // Save to memory
          if (convId && finalContent) {
            const latency = Date.now() - startTime;
            try {
              await supabase.rpc("save_message", {
                p_agent_id: agent_id, p_conversation_id: convId,
                p_role: "assistant", p_content: finalContent, p_model: model,
                p_latency_ms: latency,
              });
            } catch (e: any) { console.warn("Could not save assistant msg:", e); }
          }

          // Stream-simulate the final response for the frontend
          const messageParts = splitIntoMessages(finalContent);
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
              // Send debug trace
              if (debugTrace.length > 0) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ debug: debugTrace })}\n\n`));
              }
              // Split into WhatsApp-style separate messages
              for (let partIdx = 0; partIdx < messageParts.length; partIdx++) {
                const part = messageParts[partIdx];
                // Send split marker between parts
                if (partIdx > 0) {
                  const splitEv = { choices: [{ delta: { content: MSG_SPLIT } }] };
                  await writer.write(encoder.encode(`data: ${JSON.stringify(splitEv)}\n\n`));
                }
                // Send part content in chunks for smooth rendering
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

          // Refresh conversations
          if (convId) {
            try { await supabase.rpc("list_agent_conversations", { p_agent_id: agent_id, p_limit: 1 }); } catch {}
          }

          return new Response(readable, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
          });
        }

        // Process tool calls
        debugTrace.push({
          type: "llm_tool_plan",
          tool_names: assistantMsg.tool_calls.map((tc: any) => tc.function?.name),
          content_preview: String(assistantMsg.content || "").slice(0, 240),
          timestamp: Date.now(),
        });
        console.log(`Processing ${assistantMsg.tool_calls.length} tool call(s)`);
        currentMessages.push(assistantMsg);

        // Save tool call message to memory
        if (convId) {
          try {
            await supabase.rpc("save_message", {
              p_agent_id: agent_id, p_conversation_id: convId,
              p_role: "assistant", p_content: assistantMsg.content || "",
              p_model: model,
            });
          } catch (e: any) { console.warn("Could not save tool call msg:", e); }
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any> = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch { /* empty args */ }

          // Find the matching tool
          const matchedTool = agentTools.find(
            (t) => (t.function_def?.name || t.name) === toolName
          );

          let toolResult: string;
          if (matchedTool) {
            console.log(`Executing tool: ${toolName} (${matchedTool.tool_type})`);
            debugTrace.push({ type: "tool_call", tool: toolName, tool_type: matchedTool.tool_type, args: toolArgs, timestamp: Date.now() });
            toolResult = await executeTool(matchedTool, toolArgs, supabase, agent_id);

            // Build a short preview of the result for debug
            let resultPreview: any = {};
            try {
              const parsed = JSON.parse(toolResult);
              resultPreview = { total: parsed.total, vehicle_count: parsed.vehicles?.length, hint: parsed._hint, error: parsed.error, message: parsed.message };
            } catch {
              resultPreview = { raw_length: toolResult.length };
            }
            debugTrace.push({ type: "tool_result", tool: toolName, preview: resultPreview, timestamp: Date.now() });

            if (matchedTool.tool_type === "inventory_query") {
              try {
                const parsedToolResult = JSON.parse(toolResult);
                if (Array.isArray(parsedToolResult?.vehicles)) {
                  lastInventoryVehicles = parsedToolResult.vehicles;
                }
              } catch {
                // ignore parse errors
              }
            }
          } else {
            toolResult = JSON.stringify({ error: `Tool '${toolName}' not found` });
            debugTrace.push({ type: "tool_error", tool: toolName, error: "Tool not found" });
          }

          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });

          // Save tool result to memory
          if (convId) {
            try {
              await supabase.rpc("save_message", {
                p_agent_id: agent_id, p_conversation_id: convId,
                p_role: "tool", p_content: toolResult,
              });
            } catch {}
          }
        }

        // Loop continues — next iteration will call LLM with tool results
      }

      // If we exhausted iterations, return error
      return new Response(JSON.stringify({ error: "Too many tool call iterations" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- No tools: stream directly ----------
    console.log(`Calling provider: ${provider.name}, model: ${model}, url: ${baseUrl}`);

    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: fullMessages, ...llmParams, stream: true }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error(`Provider error: ${resp.status}`, t);
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
            if (json === "[DONE]") {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const ev = JSON.parse(json);
              const content = ev.choices?.[0]?.delta?.content;
              if (content) fullContent += content;
              await writer.write(encoder.encode(`data: ${json}\n\n`));
            } catch {
              await writer.write(encoder.encode(`data: ${json}\n\n`));
            }
          }
        }
        if (convId && fullContent) {
          const latency = Date.now() - startTime;
          try {
            await supabase.rpc("save_message", {
              p_agent_id: agent_id, p_conversation_id: convId,
              p_role: "assistant", p_content: fullContent, p_model: model,
              p_latency_ms: latency,
            });
          } catch (e: any) { console.warn("Could not save assistant msg:", e); }
        }
      } catch (e) { console.error("stream error:", e); }
      await writer.close();
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err: any) {
    console.error("chat-agent error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
