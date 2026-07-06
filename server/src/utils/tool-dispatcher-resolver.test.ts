import { describe, it, expect } from "vitest";
import type { ToolDef } from "../services/tool-executor.js";
import { mergeBuiltinAgentTools, tenantUsesGalleryBuiltin } from "./builtin-agent-tools.js";
import {
  DISPATCHER_CALL_TO_TOOL_TYPE,
  registerToolNameKeys,
  resolveToolFromDispatcherCall,
  sanitizeFunctionName,
} from "./tool-dispatcher-resolver.js";

function makeTool(overrides: Partial<ToolDef> = {}): ToolDef {
  return {
    id: "tool-1",
    name: "consultar_hospedagem_sunset",
    tool_type: "lodging_consulta",
    function_def: {
      name: "consultar_hospedagem_sunset",
      description: "Consulta hospedagem",
      parameters: { type: "object", properties: {} },
    },
    ...overrides,
  };
}

describe("sanitizeFunctionName", () => {
  it("remove acentos e caracteres inválidos", () => {
    expect(sanitizeFunctionName("enviar_notificação")).toBe("enviar_notificacao");
    expect(sanitizeFunctionName("suite_gallery_query")).toBe("suite_gallery_query");
  });
});

describe("resolveToolFromDispatcherCall", () => {
  it("resolve pelo nome sanitizado exposto ao LLM", () => {
    const tool = makeTool();
    const map = new Map<string, ToolDef>();
    registerToolNameKeys(map, tool);
    expect(resolveToolFromDispatcherCall("consultar_hospedagem_sunset", map, [tool])).toBe(tool);
  });

  it("resolve alias lodging_consulta quando function_def.name difere", () => {
    const tool = makeTool({
      name: "Hospedagem Sunset",
      function_def: {
        name: "lodging_consulta",
        parameters: { type: "object", properties: {} },
      },
    });
    const map = new Map<string, ToolDef>();
    registerToolNameKeys(map, tool);
    expect(resolveToolFromDispatcherCall("consultar_hospedagem_sunset", map, [tool])).toBe(tool);
  });

  it("resolve suite_gallery_query via tool sintética quando não vinculada", () => {
    const map = new Map<string, ToolDef>();
    const lodging = makeTool();
    registerToolNameKeys(map, lodging);
    const resolved = resolveToolFromDispatcherCall("suite_gallery_query", map, [lodging]);
    expect(resolved?.tool_type).toBe("suite_gallery_query");
    expect(resolved?.name).toBe("suite_gallery_query");
  });

  it("resolve suite_gallery_query pelo nome_galeria alias quando tool vinculada", () => {
    const gallery: ToolDef = {
      id: "gal-1",
      name: "suite_gallery_query",
      tool_type: "suite_gallery_query",
      function_def: {
        name: "suite_gallery_query",
        parameters: { type: "object", properties: {} },
      },
    };
    const map = new Map<string, ToolDef>();
    registerToolNameKeys(map, gallery);
    expect(resolveToolFromDispatcherCall("suite_gallery_query", map, [gallery])).toBe(gallery);
  });

  it("retorna undefined para tool desconhecida", () => {
    const map = new Map<string, ToolDef>();
    expect(resolveToolFromDispatcherCall("consultar_estoque", map, [])).toBeUndefined();
  });
});

describe("mergeBuiltinAgentTools", () => {
  it("injeta suite_gallery_query para sunset quando ausente", () => {
    const lodging = makeTool();
    const merged = mergeBuiltinAgentTools([lodging], {
      tenantSlug: "sunset-thermas-park",
      tenantId: "tenant-uuid",
    });
    expect(merged.some((t) => t.tool_type === "suite_gallery_query")).toBe(true);
    expect(merged.some((t) => t.tool_type === "lodging_consulta")).toBe(true);
  });

  it("não duplica suite_gallery_query se já existir", () => {
    const gallery: ToolDef = {
      id: "gal-1",
      name: "suite_gallery_query",
      tool_type: "suite_gallery_query",
      function_def: { name: "suite_gallery_query" },
    };
    const merged = mergeBuiltinAgentTools([gallery], {
      tenantSlug: "sunset-thermas-park",
      tenantId: "tenant-uuid",
    });
    expect(merged.filter((t) => t.tool_type === "suite_gallery_query")).toHaveLength(1);
  });

  it("não injeta galeria para tenant sem builtin", () => {
    const merged = mergeBuiltinAgentTools([makeTool()], {
      tenantSlug: "ppl-motors",
      tenantId: "tenant-uuid",
    });
    expect(merged.some((t) => t.tool_type === "suite_gallery_query")).toBe(false);
  });
});

describe("tenantUsesGalleryBuiltin", () => {
  it("inclui sunset e vale suíço", () => {
    expect(tenantUsesGalleryBuiltin("sunset-thermas-park")).toBe(true);
    expect(tenantUsesGalleryBuiltin("vale-suico")).toBe(true);
    expect(tenantUsesGalleryBuiltin("ppl-motors")).toBe(false);
  });
});

describe("DISPATCHER_CALL_TO_TOOL_TYPE", () => {
  it("mapeia nomes do dispatcher sunset", () => {
    expect(DISPATCHER_CALL_TO_TOOL_TYPE.consultar_hospedagem_sunset).toBe("lodging_consulta");
    expect(DISPATCHER_CALL_TO_TOOL_TYPE.suite_gallery_query).toBe("suite_gallery_query");
    expect(DISPATCHER_CALL_TO_TOOL_TYPE.consultar_parque_sunset).toBe("park_consulta");
  });
});

// Reimplement buildOpenAITools logic for unit test (função está em chat-local.ts)
function buildOpenAIToolsForTest(tools: ToolDef[]) {
  const nameToTool = new Map<string, ToolDef>();
  const openaiTools = tools
    .filter((t) => {
      const fd = t.function_def as Record<string, unknown> | undefined;
      if (fd && typeof fd.name === "string" && fd.name.trim()) return true;
      return ["suite_gallery_query", "lodging_consulta", "park_consulta"].includes(t.tool_type);
    })
    .map((t) => {
      const fd = (t.function_def || {}) as Record<string, unknown>;
      const originalName =
        (typeof fd.name === "string" && fd.name.trim()) || t.name || t.tool_type;
      const sanitizedName = sanitizeFunctionName(originalName);
      registerToolNameKeys(nameToTool, t);
      if (!nameToTool.has(sanitizedName)) nameToTool.set(sanitizedName, t);
      return {
        type: "function" as const,
        function: {
          name: sanitizedName,
          description: (fd.description as string) || "",
          parameters: fd.parameters || { type: "object", properties: {} },
        },
      };
    });
  return { openaiTools, nameToTool };
}

describe("buildOpenAITools name registration", () => {
  it("registra aliases consultar_hospedagem_sunset e suite_gallery_query", () => {
    const lodging = makeTool();
    const gallery: ToolDef = {
      id: "gal-1",
      name: "suite_gallery_query",
      tool_type: "suite_gallery_query",
      function_def: { name: "suite_gallery_query", parameters: { type: "object", properties: {} } },
    };
    const { nameToTool, openaiTools } = buildOpenAIToolsForTest([lodging, gallery]);
    expect(openaiTools).toHaveLength(2);
    expect(nameToTool.get("consultar_hospedagem_sunset")).toBe(lodging);
    expect(nameToTool.get("suite_gallery_query")).toBe(gallery);
    expect(resolveToolFromDispatcherCall("consultar_hospedagem_sunset", nameToTool, [lodging, gallery])).toBe(
      lodging
    );
  });
});
