import { describe, expect, it } from "vitest";
import {
  mergeBuiltinAgentTools,
  tenantForcesNoTools,
  tenantUsesGalleryBuiltin,
} from "./builtin-agent-tools.js";
import type { ToolDef } from "../services/tool-executor.js";

const calendarTool: ToolDef = {
  id: "t1",
  name: "consultar_evento",
  tool_type: "calendar_query",
  function_def: { name: "consultar_evento" },
  execution_config: {},
};

describe("tenantForcesNoTools", () => {
  it("não bloqueia divino-chale (calendário de diárias ativo)", () => {
    expect(tenantForcesNoTools("divino-chale")).toBe(false);
    expect(tenantForcesNoTools("divinochale")).toBe(false);
  });

  it("não bloqueia outros tenants por padrão", () => {
    expect(tenantForcesNoTools("sunset-thermas-park")).toBe(false);
    expect(tenantForcesNoTools(null)).toBe(false);
  });
});

describe("mergeBuiltinAgentTools", () => {
  it("mantém calendar_query do Divino Chalé e injeta galeria", () => {
    const out = mergeBuiltinAgentTools([calendarTool], {
      tenantSlug: "divino-chale",
      tenantId: "tenant-1",
    });
    expect(out.map((t) => t.tool_type).sort()).toEqual(["calendar_query", "suite_gallery_query"]);
  });

  it("mantém tools de outros tenants", () => {
    const out = mergeBuiltinAgentTools([calendarTool], {
      tenantSlug: "ppl-motors",
      tenantId: "tenant-1",
    });
    expect(out).toHaveLength(1);
    expect(out[0].tool_type).toBe("calendar_query");
  });

  it("gallery builtin só para tenants allowlist", () => {
    expect(tenantUsesGalleryBuiltin("sunset-thermas-park")).toBe(true);
    expect(tenantUsesGalleryBuiltin("divino-chale")).toBe(true);
    expect(tenantUsesGalleryBuiltin("divinochale")).toBe(true);
    expect(tenantUsesGalleryBuiltin("ppl-motors")).toBe(false);
  });

  it("injeta suite_gallery_query no Divino Chalé quando faltando", () => {
    const out = mergeBuiltinAgentTools([calendarTool], {
      tenantSlug: "divino-chale",
      tenantId: "tenant-1",
    });
    expect(out.some((t) => t.tool_type === "suite_gallery_query")).toBe(true);
    expect(out.some((t) => t.tool_type === "calendar_query")).toBe(true);
  });
});
