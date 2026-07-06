import type { ToolDef } from "../services/tool-executor.js";
import { createSuiteGalleryQueryTool } from "./builtin-agent-tools.js";

/**
 * Nomes que o dispatcher (prompt) pode usar vs tool_type real no banco.
 * Permite resolver consultar_hospedagem_sunset → lodging_consulta, etc.
 */
export const DISPATCHER_CALL_TO_TOOL_TYPE: Record<string, string> = {
  consultar_hospedagem_sunset: "lodging_consulta",
  consultar_hospedagem: "lodging_consulta",
  consultar_hospedagem_parque: "lodging_consulta",
  lodging_consulta: "lodging_consulta",
  consultar_parque_sunset: "park_consulta",
  consultar_parque: "park_consulta",
  park_consulta: "park_consulta",
  suite_gallery_query: "suite_gallery_query",
  suite_gallery: "suite_gallery_query",
};

/**
 * Sanitiza nome de função para OpenAI e Gemini.
 * OpenAI: ^[a-zA-Z0-9_-]+$
 * Gemini: ^[a-zA-Z_][a-zA-Z0-9_.:-]{0,63}$
 */
export function sanitizeFunctionName(name: string): string {
  let s = String(name || "tool").trim();
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-zA-Z0-9_-]/g, "_");
  s = s.replace(/_+/g, "_");
  if (s && !/^[a-zA-Z_]/.test(s)) s = "_" + s;
  s = s.replace(/_+$/, "");
  if (!s) s = "tool";
  return s.slice(0, 64);
}

function uniqueToolsFromMap(nameToTool: Map<string, ToolDef>): ToolDef[] {
  const seen = new Set<string>();
  const out: ToolDef[] = [];
  for (const tool of nameToTool.values()) {
    const key = tool.id || `${tool.tool_type}:${tool.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tool);
  }
  return out;
}

function registerNameKey(nameToTool: Map<string, ToolDef>, key: string, tool: ToolDef): void {
  const k = key.trim();
  if (!k) return;
  if (!nameToTool.has(k)) {
    nameToTool.set(k, tool);
  }
}

/** Registra todas as chaves conhecidas para lookup (sanitized, original, aliases por tool_type). */
export function registerToolNameKeys(nameToTool: Map<string, ToolDef>, tool: ToolDef): void {
  const fd = tool.function_def as Record<string, unknown> | undefined;
  const fdName = typeof fd?.name === "string" ? fd.name : "";
  const sanitizedFd = fdName ? sanitizeFunctionName(fdName) : "";

  if (sanitizedFd) registerNameKey(nameToTool, sanitizedFd, tool);
  if (fdName && fdName !== sanitizedFd) registerNameKey(nameToTool, fdName, tool);
  if (tool.name) {
    registerNameKey(nameToTool, tool.name, tool);
    const sanitizedName = sanitizeFunctionName(tool.name);
    if (sanitizedName !== tool.name) registerNameKey(nameToTool, sanitizedName, tool);
  }

  for (const [alias, toolType] of Object.entries(DISPATCHER_CALL_TO_TOOL_TYPE)) {
    if (tool.tool_type === toolType) {
      registerNameKey(nameToTool, alias, tool);
      registerNameKey(nameToTool, sanitizeFunctionName(alias), tool);
    }
  }
}

function findByToolType(candidates: ToolDef[], toolType: string, callName: string): ToolDef | undefined {
  const typed = candidates.filter((t) => t.tool_type === toolType);
  if (typed.length === 0) return undefined;
  if (typed.length === 1) return typed[0];

  const normalizedCall = sanitizeFunctionName(callName).toLowerCase();
  for (const tool of typed) {
    const fd = tool.function_def as Record<string, unknown> | undefined;
    const fdName = typeof fd?.name === "string" ? fd.name : "";
    if (
      tool.name.toLowerCase() === callName.toLowerCase() ||
      fdName.toLowerCase() === callName.toLowerCase() ||
      sanitizeFunctionName(fdName).toLowerCase() === normalizedCall
    ) {
      return tool;
    }
  }
  return typed[0];
}

function createSyntheticTool(toolType: string, callName: string): ToolDef {
  if (toolType === "suite_gallery_query") {
    return createSuiteGalleryQueryTool();
  }
  return {
    id: `synthetic-${toolType}`,
    name: callName,
    tool_type: toolType,
    function_def: { name: callName },
    execution_config: {},
  };
}

/**
 * Resolve tool a partir do nome retornado pelo dispatcher.
 * Fallback: alias → tool_type → tool sintética (suite_gallery_query).
 */
export function resolveToolFromDispatcherCall(
  callName: string,
  nameToTool: Map<string, ToolDef>,
  allTools?: ToolDef[]
): ToolDef | undefined {
  const trimmed = String(callName || "").trim();
  if (!trimmed) return undefined;

  const direct = nameToTool.get(trimmed);
  if (direct) return direct;

  const sanitized = sanitizeFunctionName(trimmed);
  const bySanitized = nameToTool.get(sanitized);
  if (bySanitized) return bySanitized;

  const candidates = allTools ?? uniqueToolsFromMap(nameToTool);

  for (const tool of candidates) {
    const fd = tool.function_def as Record<string, unknown> | undefined;
    const fdName = typeof fd?.name === "string" ? fd.name : "";
    if (
      fdName === trimmed ||
      sanitizeFunctionName(fdName) === sanitized ||
      tool.name === trimmed ||
      sanitizeFunctionName(tool.name) === sanitized
    ) {
      return tool;
    }
  }

  const targetType =
    DISPATCHER_CALL_TO_TOOL_TYPE[trimmed] ??
    DISPATCHER_CALL_TO_TOOL_TYPE[sanitized.toLowerCase()];

  if (targetType) {
    const byType = findByToolType(candidates, targetType, trimmed);
    if (byType) return byType;

    if (targetType === "suite_gallery_query") {
      console.warn(
        "[Chat-Local] suite_gallery_query chamada sem tool vinculada — usando execução sintética:",
        trimmed
      );
      return createSyntheticTool(targetType, trimmed);
    }
  }

  return undefined;
}
