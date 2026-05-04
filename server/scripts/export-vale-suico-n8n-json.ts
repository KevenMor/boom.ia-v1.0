/**
 * Exporta artefatos para n8n e outros consumidores.
 * Uso: cd server && npm run export:n8n:vale-suico
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
  SYSTEM_PROMPT,
} from "../src/services/prompts/vale-suico.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const outDir = join(repoRoot, "exports");

const systemCombined = `${SYSTEM_PROMPT.trim()}\n\n---\n\n${COMMUNICATION_RULES.trim()}`;

const openai_functions = [
  {
    type: "function",
    function: {
      name: "consultar_disponibilidade_vale_suico",
      description:
        "Consulta Omnibees (read-only): preços e disponibilidade. Só cite valores em R$ após resultado neste turno com rooms e summaryText válidos. No Boom: tool_type omnibees_availability.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["checkIn", "checkOut"],
        properties: {
          checkIn: {
            type: "string",
            description: "DDMMYYYY ou YYYY-MM-DD (aliases: check_in, CheckIn)",
          },
          checkOut: {
            type: "string",
            description: "DDMMYYYY ou YYYY-MM-DD (aliases: check_out, CheckOut)",
          },
          adults: { type: "integer", minimum: 1 },
          children: { type: "integer", minimum: 0 },
          childAges: {
            type: "string",
            description: "Idades separadas por vírgula (aliases: child_ages, ag)",
          },
          rooms: { type: "integer", minimum: 1, description: "Alias: NRooms" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suite_gallery_query",
      description:
        "Galerias do tenant (fotos Markdown, URLs de vídeo). Vídeo institucional: galeria Institucional. No Boom: tool_type suite_gallery_query.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          nome_galeria: { type: "string" },
          filtro: { type: "string" },
          q: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Busca semântica na base de conhecimento do tenant (se configurada). No Boom: tool_type rag_search; parâmetro típico: query.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
      },
    },
  },
] as const;

const payload = {
  $meta: {
    generatedBy: "server/scripts/export-vale-suico-n8n-json.ts",
    tenantSlugs: ["vale-suico", "vale-suico-resort"],
    sourceModule: "server/src/services/prompts/vale-suico.ts",
    n8nUsage:
      "O arquivo n8n-vale-suico-agent-full.json NÃO é workflow n8n. Use: (1) Importar exports/n8n-workflow-vale-suico-boom-exports.json no menu Workflow; (2) Colar prompts dos .txt no AI Agent; (3) Tools: n8n-vale-suico-tools-openai.json ou saída do nó Carregar tools.",
  },
  agent_profile: {
    name: "Vitória",
    role: "Consultora de reservas — Vale Suíço Resort",
    channel: "WhatsApp",
    site: "https://valesuico.com.br/",
  },
  prompts: {
    system_prompt: SYSTEM_PROMPT,
    communication_rules: COMMUNICATION_RULES,
    system_combined: systemCombined,
    dispatcher_prompt: DISPATCHER_PROMPT,
    followup_prompt: FOLLOWUP_PROMPT,
  },
  openai_functions,
};

function buildN8nWorkflow(): object {
  const idSticky = randomUUID();
  const idManual = randomUUID();
  const idCode = randomUUID();
  const toolsLiteral = JSON.stringify(openai_functions);
  const jsCode = `// Tools OpenAI (Boom / Vale Suíço). Regen: cd server && npm run export:n8n:vale-suico
const openai_functions = ${toolsLiteral};
return [{
  json: {
    openai_functions,
    arquivos_prompt_txt: [
      'exports/vale-suico-system-combined.txt',
      'exports/vale-suico-dispatcher.txt',
      'exports/vale-suico-followup.txt',
    ],
  },
}];`;

  const stickyContent = [
    "## Vale Suíço — export Boom → n8n",
    "",
    "**Por que o JSON grande não virou estrutura?**",
    "O arquivo n8n-vale-suico-agent-full.json é dados (prompts + tools), NÃO é o formato de workflow do n8n. Colar no canvas não cria nós.",
    "",
    "**O que fazer**",
    "1. Menu Workflow → Import from File (ou colar JSON) usando n8n-workflow-vale-suico-boom-exports.json na pasta exports/.",
    "2. System message do AI Agent: abra vale-suico-system-combined.txt e copie o texto inteiro (UTF-8).",
    "3. Dispatcher (2 fases): vale-suico-dispatcher.txt.",
    "4. Follow-up: vale-suico-followup.txt.",
    "5. Tools: rode Test no workflow e use openai_functions do nó Carregar tools, ou use n8n-vale-suico-tools-openai.json.",
    "",
    "Regenerar: cd server && npm run export:n8n:vale-suico",
  ].join("\n");

  return {
    name: "Vale Suíço — prompts Boom (referência)",
    nodes: [
      {
        parameters: {
          content: stickyContent,
          height: 520,
          width: 460,
          color: 5,
        },
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [-60, -280],
        id: idSticky,
        name: "Instruções",
      },
      {
        parameters: {},
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        id: idManual,
        name: "Quando clicar em Test workflow",
      },
      {
        parameters: {
          jsCode,
        },
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [260, 0],
        id: idCode,
        name: "Carregar tools",
      },
    ],
    connections: {
      "Quando clicar em Test workflow": {
        main: [[{ node: "Carregar tools", type: "main", index: 0 }]],
      },
    },
    pinData: {},
    meta: {
      templateCredsSetupCompleted: true,
    },
  };
}

mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "n8n-vale-suico-agent-full.json"), JSON.stringify(payload, null, 2), "utf8");
writeFileSync(join(outDir, "n8n-vale-suico-tools-openai.json"), JSON.stringify(openai_functions, null, 2), "utf8");
writeFileSync(join(outDir, "vale-suico-system-combined.txt"), systemCombined, "utf8");
writeFileSync(join(outDir, "vale-suico-dispatcher.txt"), DISPATCHER_PROMPT.trim(), "utf8");
writeFileSync(join(outDir, "vale-suico-followup.txt"), FOLLOWUP_PROMPT.trim(), "utf8");
writeFileSync(
  join(outDir, "n8n-workflow-vale-suico-boom-exports.json"),
  JSON.stringify(buildN8nWorkflow(), null, 2),
  "utf8"
);

console.log(`Wrote under ${outDir}:`);
console.log("  - n8n-vale-suico-agent-full.json (dados completos, não é workflow)");
console.log("  - n8n-vale-suico-tools-openai.json (só tools, JSON pequeno)");
console.log("  - vale-suico-system-combined.txt | dispatcher | followup");
console.log("  - n8n-workflow-vale-suico-boom-exports.json ← IMPORTAR NO N8N");
