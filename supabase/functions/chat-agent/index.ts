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

  return Array.from(new Set([...(vehicle?.photo_url ? [vehicle.photo_url] : []), ...parsedPhotos]));
}

function appendMissingVehiclePhotos(content: string, vehicles: any[], userContext: string): string {
  if (!vehicles.length) return content;

  const targetVehicle =
    vehicles.find((v) => {
      const hay = `${v?.brand || ""} ${v?.model || ""} ${v?.version || ""}`.toLowerCase();
      const tokens = hay.split(/\s+/).filter((t) => t.length >= 3);
      return tokens.some((token) => userContext.includes(token));
    }) || vehicles[0];

  const allPhotos = normalizeVehiclePhotos(targetVehicle);
  if (!allPhotos.length) return content;

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

function splitIntoMessages(content: string): string[] {
  const parts: string[] = [];

  // Separate photo blocks from text
  const photoRegex = /!\[.*?\]\(https?:\/\/[^\s)]+\)/g;
  const photos: string[] = [];
  const textOnly = content.replace(photoRegex, (match) => {
    photos.push(match);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();

  // Split text by double newlines (paragraphs)
  if (textOnly) {
    const paragraphs = textOnly.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    // Group short paragraphs together (under ~300 chars), split long ones
    let current = "";
    for (const para of paragraphs) {
      if (current && (current.length + para.length > 300)) {
        parts.push(current.trim());
        current = para;
      } else {
        current = current ? `${current}\n\n${para}` : para;
      }
    }
    if (current.trim()) parts.push(current.trim());
  }

  // Send photos in batches of 3 as separate messages
  for (let i = 0; i < photos.length; i += 3) {
    parts.push(photos.slice(i, i + 3).join("\n"));
  }

  return parts.length ? parts : [content];
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
        if (args.brand) query = query.or(`brand.ilike.%${args.brand}%,model.ilike.%${args.brand}%,version.ilike.%${args.brand}%,description.ilike.%${args.brand}%`);
        if (args.model) query = query.or(`model.ilike.%${args.model}%,version.ilike.%${args.model}%,brand.ilike.%${args.model}%,description.ilike.%${args.model}%`);
        if (args.search || args.query || args.termo) {
          const term = args.search || args.query || args.termo;
          query = query.or(`brand.ilike.%${term}%,model.ilike.%${term}%,version.ilike.%${term}%,description.ilike.%${term}%,color.ilike.%${term}%`);
        }
        if (args.year) query = query.eq("year", args.year);
        if (args.fuel_type || args.fuel) query = query.ilike("fuel_type", `%${args.fuel_type || args.fuel}%`);
        if (args.transmission) query = query.ilike("transmission", `%${args.transmission}%`);
        if (args.min_price) query = query.gte("price", args.min_price);
        if (args.max_price) query = query.lte("price", args.max_price);
        if (args.color) query = query.ilike("color", `%${args.color}%`);

        // No limit — return all matching vehicles
        query = query.order("price", { ascending: true });

        const { data, error } = await query;

        console.log(`Inventory query result: ${data?.length ?? 0} vehicles found, error: ${error?.message ?? 'none'}`);

        if (error) return JSON.stringify({ error: error.message });
        if (!data?.length) return JSON.stringify({ message: "Nenhum veículo encontrado com esses filtros" });

        return JSON.stringify({
          total: data.length,
          vehicles: data.map((v: any) => {
            let parsedPhotos: string[] = [];

            if (Array.isArray(v.photos)) {
              parsedPhotos = v.photos.filter((p: unknown) => typeof p === "string") as string[];
            } else if (typeof v.photos === "string" && v.photos.trim()) {
              try {
                const decoded = JSON.parse(v.photos);
                if (Array.isArray(decoded)) {
                  parsedPhotos = decoded.filter((p: unknown) => typeof p === "string") as string[];
                }
              } catch {
                // keep empty when invalid JSON
              }
            }

            const allPhotos = Array.from(
              new Set([...(v.photo_url ? [v.photo_url] : []), ...parsedPhotos])
            );

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
      ? `\n\nREGRAS OBRIGATÓRIAS SOBRE FOTOS DE VEÍCULOS:
1. Quando mostrar veículos, SEMPRE inclua TODAS as fotos do array 'photos' retornado pela consulta, cada uma em linha separada usando: ![foto](URL)
2. Se o array 'photos' estiver vazio, use o campo 'photo_url'.
3. NUNCA escreva nomes de ferramentas (como ENVIAR_FOTOS_VEICULO) no texto.
4. Se o cliente pedir MAIS fotos ou fotos adicionais de um veículo, você DEVE chamar a ferramenta consultar_estoque novamente filtrando pelo veículo específico para obter as fotos atualizadas. NUNCA responda apenas com texto dizendo que vai enviar — chame a ferramenta e envie as fotos de fato.
5. Mostre as fotos naturalmente na conversa, sem mencionar URLs ou campos técnicos.`
      : "";
    const systemPrompt = (agent.system_prompt || "You are a helpful AI assistant.") + photoInstruction;
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
      const userAskedForPhotos = /\bfotos?\b|\bimagens?\b/.test(userConversationText);
      let lastInventoryVehicles: any[] = [];

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

        // If no tool calls, we have the final response
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          let finalContent = sanitizeLLMOutput(assistantMsg.content || "");

          if (userAskedForPhotos && lastInventoryVehicles.length > 0) {
            finalContent = appendMissingVehiclePhotos(finalContent, lastInventoryVehicles, userConversationText);
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
          const { readable, writable } = new TransformStream();
          const writer = writable.getWriter();
          const encoder = new TextEncoder();

          (async () => {
            try {
              if (convId) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ conversation_id: convId })}\n\n`));
              }
              // Split into WhatsApp-style separate messages
              const messageParts = splitIntoMessages(finalContent);
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
            toolResult = await executeTool(matchedTool, toolArgs, supabase, agent_id);

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
