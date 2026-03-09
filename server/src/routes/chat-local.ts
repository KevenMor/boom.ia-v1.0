import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { buildSystemPrompt, getDispatcherPrompt } from "../services/prompts/registry.js";
import { executeTool, type ToolDef } from "../services/tool-executor.js";

const MSG_SPLIT = "<<MSG_SPLIT>>";
const MAX_TOOL_ITERATIONS = 5;

/** Mensagem amigável quando a API do provedor (OpenAI/Gemini) retorna erro HTTP */
function providerErrorMessage(status: number, errText: string): string {
  const preview = errText.slice(0, 200).replace(/\s+/g, " ").trim();
  if (status === 401) return "API key inválida ou expirada (401). Verifique o provedor em Provedores e atualize a chave.";
  if (status === 403) return "Acesso negado pelo provedor de IA (403). Verifique a API key e permissões em Provedores.";
  if (status === 429) return "Limite de uso do provedor excedido (429). Tente mais tarde ou verifique o plano/créditos.";
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

export async function chatLocalRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/chat-local",
    async (
      req: FastifyRequest<{
        Body: {
          agent_id: string;
          messages: Array<{ role: string; content: string }>;
          conversation_id?: string | null;
          attachments?: unknown[];
          external_user_id?: string | null;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { agent_id, messages, conversation_id } = req.body;

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
      const tools = (toolsData || []) as ToolDef[];
      const hasInventoryTool = tools.some((t) => t.tool_type === "inventory_query");

      const systemPrompt = buildSystemPrompt(
        agent.system_prompt || "",
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

      let responseConvId = conversation_id ?? null;

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

      // Dual-provider: OpenAI para tools (dispatcher), Gemini para conversacional
      if (useTools && dispatcherProviderId) {
        const dispatcherConfig = await getProviderApiKey(dispatcherProviderId, supabase);
        if (dispatcherConfig) {
          console.log("[Chat-Local] Dual-provider: dispatcher (tools) + conversacional");
          const { openaiTools: dispatcherTools, nameToTool: dispatcherNameToTool } = buildOpenAITools(tools, dispatcherConfig.baseUrl);
          const dispatcherModel = (agentConfig.dispatcher_model as string) || "gpt-4o-mini";
          const dispatcherMessages = toOpenAIMessages(getDispatcherPrompt(tenantSlug), messages);

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

          const phase1ToolCalls = Object.values(toolCallsAccum)
            .filter((tc) => tc.name)
            .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.args } }));

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

          if (toolResults.length > 0) {
            conversationalMessagesClean.push({
              role: "user",
              content: `[Resultados das ferramentas executadas]:\n${toolResults.join("\n\n")}`,
            });
          }

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
          console.log("[Chat-Local] Conversational LLM response OK, iniciando streaming...");

          const convReader = convResp.body!.getReader();
          const convDecoder = new TextDecoder();
          let convBuf = "";
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
                    console.log("[Chat-Local] Streaming content chunk:", delta.content.slice(0, 50));
                    sendSse({ choices: [{ delta: { content: delta.content } }] });
                  }
                } catch { /* skip */ }
              }
            }
            if (done) break;
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
                  sendSse({ choices: [{ delta: { content: delta.content } }] });
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
          if (done) break;
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
      sendSse({ conversation_id: responseConvId });
      sendSse("[DONE]");
      reply.raw.end();
    }
  );
}
