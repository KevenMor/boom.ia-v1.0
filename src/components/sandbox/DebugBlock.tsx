import { useState } from "react";
import { Bug, ChevronDown, ChevronRight } from "lucide-react";

type DebugEntry = { type: string; [key: string]: any };

interface DebugBlockProps {
  debug: DebugEntry[];
}

export function DebugBlock({ debug }: DebugBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!debug.length) return null;

  const config = debug.find((d) => d.type === "config");
  const toolCalls = debug.filter((d) => d.type === "tool_call");
  const toolResults = debug.filter((d) => d.type === "tool_result");
  const errors = debug.filter((d) => d.type === "tool_error");

  return (
    <div className="mb-1 max-w-[85%] md:max-w-[65%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-[#8696a0] hover:text-[#aebac1] transition-colors px-2 py-1 rounded bg-[#111b21] border border-[#2a3942]/50"
      >
        <Bug className="h-3 w-3" />
        <span>Debug</span>
        <span className="text-[#00a884]">
          {toolCalls.length} tool call{toolCalls.length !== 1 ? "s" : ""}
        </span>
        {errors.length > 0 && (
          <span className="text-red-400">{errors.length} error{errors.length !== 1 ? "s" : ""}</span>
        )}
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-1 bg-[#111b21] border border-[#2a3942] rounded-lg p-3 text-[11px] font-mono space-y-2 overflow-x-auto">
          {/* Config */}
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

          {/* Tool Calls */}
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

          {/* Errors */}
          {errors.map((err, i) => (
            <div key={i} className="border-t border-[#2a3942] pt-2">
              <div className="text-red-400 font-semibold">❌ Erro: {err.tool}</div>
              <div className="text-red-300">{err.error}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
