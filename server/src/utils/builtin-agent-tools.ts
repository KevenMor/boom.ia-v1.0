import type { ToolDef } from "../services/tool-executor.js";

/** Definição OpenAI padrão para suite_gallery_query (painel Galeria). */
export const SUITE_GALLERY_FUNCTION_DEF: Record<string, unknown> = {
  name: "suite_gallery_query",
  description:
    "Galerias do tenant (fotos Markdown, URLs de vídeo). Parâmetros: nome/nome_galeria para filtrar; contexto/tema/topico para busca temática.",
  parameters: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome ou parte do nome da galeria" },
      nome_galeria: { type: "string", description: "Alias de nome" },
      filtro: { type: "string" },
      q: { type: "string" },
      contexto: { type: "string", description: "Tema do pedido (ex.: piscina, chalé)" },
      tema: { type: "string", description: "Alias de contexto" },
      topico: { type: "string", description: "Alias de contexto" },
    },
  },
};

const TENANTS_WITH_GALLERY_BUILTIN = new Set([
  "sunset-thermas",
  "sunset-thermas-park",
  "vale-suico",
  "vale-suico-resort",
]);

export function tenantUsesGalleryBuiltin(slug: string | null | undefined): boolean {
  return !!slug && TENANTS_WITH_GALLERY_BUILTIN.has(slug);
}

export function createSuiteGalleryQueryTool(tenantId?: string): ToolDef {
  return {
    id: "builtin-suite-gallery-query",
    name: "suite_gallery_query",
    tool_type: "suite_gallery_query",
    tenant_id: tenantId,
    function_def: SUITE_GALLERY_FUNCTION_DEF,
    execution_config: {},
  };
}

/** Garante tools internas do servidor quando não vinculadas em agent_tools (evita "Tool not found" em prod). */
export function mergeBuiltinAgentTools(
  tools: ToolDef[],
  opts: { tenantSlug: string | null; tenantId: string }
): ToolDef[] {
  const out = [...tools];
  const hasType = (toolType: string) => out.some((t) => t.tool_type === toolType);

  if (tenantUsesGalleryBuiltin(opts.tenantSlug) && !hasType("suite_gallery_query")) {
    console.warn(
      "[Chat-Local] suite_gallery_query não vinculada ao agente — injetando definição builtin (aplique sql/041 e sql/042 em prod)"
    );
    out.push(createSuiteGalleryQueryTool(opts.tenantId));
  }

  return out;
}
