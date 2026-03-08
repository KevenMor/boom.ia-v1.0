import { useState } from "react";
import { Bug, ChevronDown, ChevronRight, ScrollText } from "lucide-react";

type DebugEntry = { type: string; [key: string]: any };

type TokenUsageEntry = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model?: string;
};

type TokenUsageData = {
  dispatcher?: TokenUsageEntry | null;
  conversational?: TokenUsageEntry | null;
  single?: TokenUsageEntry | null;
};

interface DebugBlockProps {
  debug: DebugEntry[];
  edgeLogs?: EdgeLog[];
  tokenUsage?: TokenUsageData | null;
}

export interface EdgeLog {
  timestamp: string;
  level: string;
  message: string;
}

// Preços por 1M tokens (USD) - atualizado 2025
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4": { input: 30, output: 60 },
  "gemini-2.0-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash-exp": { input: 0.075, output: 0.3 },
  "gemini-3-flash-preview": { input: 0.075, output: 0.3 },
};

function estimateCost(entry: TokenUsageEntry): number {
  const model = (entry.model || "").toLowerCase();
  const prices = PRICING[model] || PRICING["gpt-4o-mini"];
  const inputCost = (entry.prompt_tokens / 1_000_000) * prices.input;
  const outputCost = (entry.completion_tokens / 1_000_000) * prices.output;
  return inputCost + outputCost;
}

export function DebugBlock({ debug, edgeLogs, tokenUsage }: DebugBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  if (!debug.length && !edgeLogs?.length && !tokenUsage) return null;

  const config = debug.find((d) => d.type === "config");
  const toolCalls = debug.filter((d) => d.type === "tool_call");
  const toolResults = debug.filter((d) => d.type === "tool_result");
  const errors = debug.filter((d) => d.type === "tool_error");
  const llmIterations = debug.filter((d) => d.type === "llm_iteration");
  const llmPlans = debug.filter((d) => d.type === "llm_tool_plan");
  const llmTransforms = debug.filter((d) => d.type === "llm_transform");
  const geminiResponses = debug.filter((d) => d.type === "gemini_response");
  const mediaAttachments = debug.filter((d) => d.type === "media_attachments" || d.type === "audio_transcription" || d.type === "image_attachment");
  const fipeExtractions = debug.filter((d) => d.type === "fipe_extraction");
  const fipeIntercepts = debug.filter((d) => d.type === "fipe_intercept" || d.type === "fipe_intercept_result");
  const dispatcherSteps = debug.filter((d) => d.type?.startsWith("dispatcher_"));
  const tokenUsages = debug.filter((d) => d.type === "token_usage");
  const dispatcherTokensFromDebug = dispatcherSteps
    .filter((d) => d.usage)
    .reduce((acc, d) => ({
      prompt: acc.prompt + (d.usage?.prompt_tokens || 0),
      completion: acc.completion + (d.usage?.completion_tokens || 0),
      total: acc.total + (d.usage?.total_tokens || 0),
    }), { prompt: 0, completion: 0, total: 0 });
  const convTokensFromDebug = tokenUsages.reduce((acc, d) => ({
    prompt: acc.prompt + (d.prompt_tokens || 0),
    completion: acc.completion + (d.completion_tokens || 0),
    total: acc.total + (d.total_tokens || 0),
  }), { prompt: 0, completion: 0, total: 0 });
  const totalTokensFromDebug = dispatcherTokensFromDebug.total + convTokensFromDebug.total;

  const dispatcherTokens = tokenUsage?.dispatcher
    ? { prompt: tokenUsage.dispatcher.prompt_tokens, completion: tokenUsage.dispatcher.completion_tokens, total: tokenUsage.dispatcher.total_tokens }
    : dispatcherTokensFromDebug;
  const convTokens = tokenUsage?.conversational
    ? { prompt: tokenUsage.conversational.prompt_tokens, completion: tokenUsage.conversational.completion_tokens, total: tokenUsage.conversational.total_tokens }
    : tokenUsage?.single
      ? { prompt: tokenUsage.single.prompt_tokens, completion: tokenUsage.single.completion_tokens, total: tokenUsage.single.total_tokens }
      : convTokensFromDebug;
  const totalTokens = tokenUsage
    ? (tokenUsage.dispatcher?.total_tokens ?? 0) + (tokenUsage.conversational?.total_tokens ?? 0) + (tokenUsage.single?.total_tokens ?? 0)
    : totalTokensFromDebug;

  const estimatedCost =
    (tokenUsage?.dispatcher ? estimateCost(tokenUsage.dispatcher) : 0) +
    (tokenUsage?.conversational ? estimateCost(tokenUsage.conversational) : 0) +
    (tokenUsage?.single ? estimateCost(tokenUsage.single) : 0);

  return (
    <div className="mb-1 max-w-[85%] md:max-w-[65%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-[#8696a0] hover:text-[#aebac1] transition-colors px-2 py-1 rounded bg-[#111b21] border border-[#2a3942]/50"
      >
        <Bug className="h-3 w-3" />
        <span>Debug</span>
        <span className="text-[#00a884]">{toolCalls.length} tool call{toolCalls.length !== 1 ? "s" : ""}</span>
        {fipeExtractions.length > 0 && <span className="text-amber-400">🔍 FIPE</span>}
        {dispatcherSteps.length > 0 && <span className="text-purple-400">{dispatcherSteps.length} dispatch</span>}
        <span className="text-[#53bdeb]">{llmIterations.length} LLM step{llmIterations.length !== 1 ? "s" : ""}</span>
        {errors.length > 0 && <span className="text-red-400">{errors.length} erro{errors.length !== 1 ? "s" : ""}</span>}
        {totalTokens > 0 && <span className="text-emerald-400">{totalTokens.toLocaleString()} tokens</span>}
        {mediaAttachments.length > 0 && <span className="text-pink-400">🎙️ mídia</span>}
        {edgeLogs && edgeLogs.length > 0 && <span className="text-orange-400">{edgeLogs.length} log{edgeLogs.length !== 1 ? "s" : ""}</span>}
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-1 bg-[#111b21] border border-[#2a3942] rounded-lg p-3 text-[11px] font-mono space-y-2 overflow-x-auto">
          {config && (
            <div>
              <div className="text-[#00a884] font-semibold mb-1">⚙️ Configuração LLM</div>
              <div className="text-[#8696a0] space-y-0.5">
                <div>Modelo: <span className="text-[#e9edef]">{config.model}</span></div>
                <div>Temperature: <span className="text-[#e9edef]">{config.temperature}</span></div>
                {config.top_p && <div>Top-P: <span className="text-[#e9edef]">{config.top_p}</span></div>}
                {config.top_k && <div>Top-K: <span className="text-[#e9edef]">{config.top_k}</span></div>}
                <div>Tools: <span className="text-[#e9edef]">{config.tools_count}</span></div>
              </div>
            </div>
          )}

          {mediaAttachments.length > 0 && (
            <div className="border-t border-[#2a3942] pt-2">
              <div className="text-pink-400 font-semibold mb-1">🎙️ Mídia Recebida</div>
              <div className="text-[#8696a0] space-y-1">
                {mediaAttachments.map((m, i) => (
                  <div key={i}>
                    {m.type === "media_attachments" && (
                      <div>📎 <span className="text-[#e9edef]">{m.audio_count} áudio(s), {m.image_count} imagem(ns), {m.file_count} arquivo(s)</span></div>
                    )}
                    {m.type === "audio_transcription" && (
                      <div>
                        <div>🎤 Transcrição ({m.transcript_length} chars):</div>
                        <pre className="mt-1 text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{m.transcript_preview}</pre>
                      </div>
                    )}
                    {m.type === "image_attachment" && (
                      <div>🖼️ Imagem: <span className="text-[#e9edef]">{m.mime_type} ({Math.round((m.size || 0) / 1024)}KB)</span></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FIPE Intercept Section */}
          {(fipeExtractions.length > 0 || fipeIntercepts.length > 0) && (
            <div className="border-t border-[#2a3942] pt-2">
              <div className="text-amber-400 font-semibold mb-1">🔍 FIPE Intercept (Pré-Dispatcher)</div>
              <div className="text-[#8696a0] space-y-2">
                {fipeExtractions.map((ext, i) => (
                  <div key={`ext-${i}`} className="space-y-1">
                    <div>
                      <span className="text-amber-300">Gatilho:</span>{" "}
                      <span className="text-[#e9edef]">{ext.trigger}</span>
                      {ext.matched_regex && (
                        <span className="text-amber-200 ml-1">
                          (regex: <code className="bg-[#0b141a] px-1 rounded">{ext.matched_regex}</code>)
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-amber-300">Texto do cliente:</span>{" "}
                      <span className="text-[#e9edef] italic">"{ext.user_text}"</span>
                    </div>
                    <div className="bg-[#0b141a] rounded p-2 space-y-1">
                      <div className="text-amber-300 font-semibold text-[10px]">📍 Extração da mensagem atual:</div>
                      <div className="pl-2">
                        Marca: <span className={ext.current_msg_extraction?.marca !== "(nenhuma)" ? "text-green-400" : "text-red-400"}>{ext.current_msg_extraction?.marca}</span>{" | "}
                        Modelo: <span className={ext.current_msg_extraction?.modelo !== "(nenhum)" ? "text-green-400" : "text-red-400"}>{ext.current_msg_extraction?.modelo}</span>{" | "}
                        Versão: <span className={ext.current_msg_extraction?.versao !== "(nenhuma)" ? "text-green-400" : "text-red-400"}>{ext.current_msg_extraction?.versao ?? "(nenhuma)"}</span>{" | "}
                        Ano: <span className={ext.current_msg_extraction?.ano !== "(nenhum)" ? "text-green-400" : "text-red-400"}>{String(ext.current_msg_extraction?.ano)}</span>
                      </div>
                      <div className="text-amber-300 font-semibold text-[10px] mt-1">📜 Fallback do histórico:</div>
                      <div className="pl-2">
                        Marca: <span className={ext.history_fallback?.marca !== "(não usado)" ? "text-yellow-400" : "text-[#8696a0]"}>{ext.history_fallback?.marca}</span>{" | "}
                        Modelo: <span className={ext.history_fallback?.modelo !== "(não usado)" ? "text-yellow-400" : "text-[#8696a0]"}>{ext.history_fallback?.modelo}</span>{" | "}
                        Versão: <span className={ext.history_fallback?.versao !== "(não usado)" ? "text-yellow-400" : "text-[#8696a0]"}>{ext.history_fallback?.versao ?? "(não usado)"}</span>{" | "}
                        Ano: <span className={ext.history_fallback?.ano !== "(não usado)" ? "text-yellow-400" : "text-[#8696a0]"}>{String(ext.history_fallback?.ano)}</span>
                      </div>
                      <div className="text-amber-300 font-semibold text-[10px] mt-1 border-t border-[#2a3942] pt-1">✅ Resultado final:</div>
                      <div className="pl-2">
                        Marca: <span className="text-[#e9edef] font-semibold">{ext.final?.marca}</span>{" | "}
                        Modelo: <span className="text-[#e9edef] font-semibold">{ext.final?.modelo}</span>{" | "}
                        Versão: <span className="text-[#e9edef] font-semibold">{ext.final?.versao ?? "(nenhuma)"}</span>{" | "}
                        Ano: <span className="text-[#e9edef] font-semibold">{String(ext.final?.ano)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {fipeIntercepts.map((fi, i) => (
                  <div key={`fi-${i}`}>
                    {fi.type === "fipe_intercept" && (
                      <div>
                        <span className="text-green-400">✅ Chamando fipe_query</span> — args:{" "}
                        <code className="text-[#e9edef] bg-[#0b141a] px-1 rounded">{JSON.stringify(fi.args)}</code>
                      </div>
                    )}
                    {fi.type === "fipe_intercept_result" && (
                      <div>
                        <span className="text-green-400">📊 Resultado FIPE:</span>{" "}
                        <span className="text-[#e9edef]">{fi.result_length} chars recebidos</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalTokens > 0 && (
            <div className="border-t border-[#2a3942] pt-2">
              <div className="text-emerald-400 font-semibold mb-1">📊 Token Usage</div>
              <div className="text-[#8696a0] space-y-0.5">
                {tokenUsage?.dispatcher && dispatcherTokens.total > 0 && (
                  <div>
                    🎯 Dispatcher ({tokenUsage.dispatcher.model}): <span className="text-[#e9edef]">{dispatcherTokens.prompt.toLocaleString()}</span> in + <span className="text-[#e9edef]">{dispatcherTokens.completion.toLocaleString()}</span> out = <span className="text-emerald-300 font-semibold">{dispatcherTokens.total.toLocaleString()}</span>
                  </div>
                )}
                {tokenUsage?.conversational && convTokens.total > 0 && (
                  <div>
                    🧠 Conversacional ({tokenUsage.conversational.model}): <span className="text-[#e9edef]">{convTokens.prompt.toLocaleString()}</span> in + <span className="text-[#e9edef]">{convTokens.completion.toLocaleString()}</span> out = <span className="text-emerald-300 font-semibold">{convTokens.total.toLocaleString()}</span>
                  </div>
                )}
                {tokenUsage?.single && convTokens.total > 0 && (
                  <div>
                    🧠 LLM ({tokenUsage.single.model}): <span className="text-[#e9edef]">{convTokens.prompt.toLocaleString()}</span> in + <span className="text-[#e9edef]">{convTokens.completion.toLocaleString()}</span> out = <span className="text-emerald-300 font-semibold">{convTokens.total.toLocaleString()}</span>
                  </div>
                )}
                {!tokenUsage && dispatcherTokens.total > 0 && (
                  <div>
                    🎯 Dispatcher: <span className="text-[#e9edef]">{dispatcherTokens.prompt.toLocaleString()}</span> prompt + <span className="text-[#e9edef]">{dispatcherTokens.completion.toLocaleString()}</span> completion = <span className="text-emerald-300 font-semibold">{dispatcherTokens.total.toLocaleString()}</span>
                  </div>
                )}
                {!tokenUsage && convTokens.total > 0 && (
                  <div>
                    🧠 Conversacional: <span className="text-[#e9edef]">{convTokens.prompt.toLocaleString()}</span> prompt + <span className="text-[#e9edef]">{convTokens.completion.toLocaleString()}</span> completion = <span className="text-emerald-300 font-semibold">{convTokens.total.toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-[#2a3942] pt-1 mt-1">
                  Total: <span className="text-emerald-300 font-bold">{totalTokens.toLocaleString()} tokens</span>
                  {estimatedCost > 0 && (
                    <span className="ml-2 text-amber-400">~${estimatedCost.toFixed(4)} USD</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {dispatcherSteps.length > 0 && (
            <div className="border-t border-[#2a3942] pt-2">
              <div className="text-purple-400 font-semibold mb-1">🎯 Tool Dispatcher</div>
              <div className="space-y-1">
                {dispatcherSteps.map((step, i) => (
                  <div key={i} className="text-[#8696a0]">
                    <span className="text-[#e9edef]">{step.type.replace("dispatcher_", "")}</span>
                    {step.provider && <> — provider: <span className="text-purple-300">{step.provider}</span></>}
                    {step.model && <> — modelo: <span className="text-[#e9edef]">{step.model}</span></>}
                    {step.tools_count !== undefined && <> — {step.tools_count} tools</>}
                    {step.tool_calls_count !== undefined && <> — {step.tool_calls_count} chamadas</>}
                    {step.tool_names && <> — <span className="text-yellow-400">{step.tool_names.join(", ")}</span></>}
                    {step.has_tool_calls === false && <span className="text-[#00a884]"> (sem tools necessárias)</span>}
                    {step.reason && <span className="text-orange-300"> ({step.reason})</span>}
                    {step.error && <div className="text-red-300 mt-0.5">{step.error}</div>}
                    {step.content_preview && (
                      <pre className="mt-1 text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{step.content_preview}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {llmIterations.length > 0 && (
            <div className="border-t border-[#2a3942] pt-2">
              <div className="text-[#53bdeb] font-semibold mb-1">🧠 Ciclo da LLM</div>
              <div className="space-y-1">
                {llmIterations.map((step, i) => (
                  <div key={i} className="text-[#8696a0]">
                    Etapa {i + 1}: finish_reason=<span className="text-[#e9edef]">{String(step.finish_reason || "-")}</span>,
                    tool_calls=<span className="text-[#e9edef]">{step.tool_calls_count ?? 0}</span>
                    {step.content_preview && (
                      <pre className="mt-1 text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{step.content_preview}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {llmPlans.map((plan, i) => (
            <div key={i} className="border-t border-[#2a3942] pt-2">
              <div className="text-[#53bdeb] font-semibold mb-1">🗺️ Plano da LLM para tools</div>
              <pre className="text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ tool_names: plan.tool_names, content_preview: plan.content_preview }, null, 2)}</pre>
            </div>
          ))}

          {llmTransforms.map((tf, i) => (
            <div key={i} className="border-t border-[#2a3942] pt-2">
              <div className="text-[#53bdeb] font-semibold mb-1">🧪 Transformação de resposta</div>
              <pre className="text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{JSON.stringify({ raw_length: tf.raw_length, sanitized_length: tf.sanitized_length, final_length: tf.final_length, parts_count: tf.parts_count, parts_preview: tf.parts_preview }, null, 2)}</pre>
            </div>
          ))}

          {geminiResponses.map((gr, i) => (
            <div key={i} className="border-t border-[#2a3942] pt-2">
              <div className="text-cyan-400 font-semibold mb-1">💬 Resposta Gemini (Phase 2)</div>
              <div className="text-[#8696a0] space-y-0.5 mb-1">
                <div>Modelo: <span className="text-[#e9edef]">{gr.model}</span></div>
                <div>Tamanho: <span className="text-[#e9edef]">{gr.full_length} chars</span></div>
              </div>
              <pre className="text-[#e9edef] bg-[#0b141a] rounded p-2 whitespace-pre-wrap text-[10px]">{gr.raw_content}</pre>
            </div>
          ))}

          {toolCalls.map((tc, i) => {
            const result = toolResults[i];
            return (
              <div key={i} className="border-t border-[#2a3942] pt-2">
                <div className="text-yellow-400 font-semibold mb-1">
                  🔧 Tool Call: {tc.tool} <span className="text-[#8696a0] font-normal">({tc.tool_type})</span>
                </div>
                <div className="text-[#8696a0] mb-1">Argumentos:</div>
                <pre className="text-[#e9edef] bg-[#0b141a] rounded p-2 overflow-x-auto whitespace-pre-wrap text-[10px]">
                  {JSON.stringify(tc.args, null, 2)}
                </pre>
                {result && (
                  <>
                    <div className="text-[#8696a0] mt-1.5 mb-1">Resultado:</div>
                    <pre className="text-[#e9edef] bg-[#0b141a] rounded p-2 overflow-x-auto whitespace-pre-wrap text-[10px]">
                      {JSON.stringify(result.preview, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            );
          })}

          {errors.map((err, i) => (
            <div key={i} className="border-t border-[#2a3942] pt-2">
              <div className="text-red-400 font-semibold">❌ Erro: {err.tool}</div>
              <div className="text-red-300">{err.error}</div>
            </div>
          ))}

          {/* Edge Function Logs */}
          {edgeLogs && edgeLogs.length > 0 && (
            <div className="border-t border-[#2a3942] pt-2">
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center gap-1.5 text-orange-400 font-semibold mb-1 hover:text-orange-300 transition-colors"
              >
                <ScrollText className="h-3 w-3" />
                📋 Edge Function Logs ({edgeLogs.length})
                {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {showLogs && (
                <div className="bg-[#0b141a] rounded p-2 space-y-0.5 max-h-60 overflow-y-auto">
                  {edgeLogs.map((log, i) => {
                    const levelColor = log.level === "error" ? "text-red-400" 
                      : log.level === "warning" || log.level === "warn" ? "text-yellow-400"
                      : "text-[#8696a0]";
                    return (
                      <div key={i} className="flex gap-2 text-[10px]">
                        <span className="text-[#8696a0] shrink-0">{log.timestamp}</span>
                        <span className={`shrink-0 uppercase ${levelColor}`}>{log.level}</span>
                        <span className="text-[#e9edef] whitespace-pre-wrap break-all">{log.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}