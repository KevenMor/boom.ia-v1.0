import { describe, it, expect } from "vitest";
import {
  enrichChatwootAssignDescription,
  validateOmnibeesArgs,
  userProvidedChildrenStatus,
} from "./chat-local.js";
import type { ToolDef } from "../services/tool-executor.js";

function makeTool(overrides: Partial<ToolDef> = {}): ToolDef {
  return {
    id: "test-id",
    name: "atribuir_agente",
    tool_type: "chatwoot_assign",
    ...overrides,
  };
}

describe("enrichChatwootAssignDescription", () => {
  it("não altera tools que não são chatwoot_assign", () => {
    const tool = makeTool({ tool_type: "sql_query" });
    expect(enrichChatwootAssignDescription(tool, "Descrição original")).toBe("Descrição original");
  });

  it("sem execution_config: instrui chamar sem argumentos", () => {
    const tool = makeTool({ execution_config: undefined });
    const result = enrichChatwootAssignDescription(tool, "Descrição original");
    expect(result).toContain("chame sem argumentos");
    expect(result).toContain("NÃO envie assignee_id nem team_id");
    expect(result).toContain("Descrição original");
  });

  it("com execution_config vazio: instrui chamar sem argumentos", () => {
    const tool = makeTool({ execution_config: {} });
    const result = enrichChatwootAssignDescription(tool, "");
    expect(result).toContain("chame sem argumentos");
    expect(result).toContain("execution_config");
  });

  it("com rules sem labels: instrui chamar sem argumentos (caso ppl-motors)", () => {
    const tool = makeTool({
      execution_config: {
        assignee_id: 29,
        rules: [{ assignee_id: 29 }],
      },
    });
    const result = enrichChatwootAssignDescription(tool, "Atribuir ao time");
    expect(result).toContain("chame sem argumentos");
    expect(result).not.toContain("Opções disponíveis");
  });

  it("com rules com labels: exibe opções e instrui usar reason (caso autoescola-ideal)", () => {
    const tool = makeTool({
      execution_config: {
        assignee_id: 10,
        rules: [
          { label: "Coop Zona Norte", team_id: 5 },
          { label: "Vila Haro", team_id: 4 },
          { label: "Vila Helena", team_id: 6 },
        ],
      },
    });
    const result = enrichChatwootAssignDescription(tool, "Atribuir ao time da unidade");
    expect(result).toContain('"Coop Zona Norte"');
    expect(result).toContain('"Vila Haro"');
    expect(result).toContain('"Vila Helena"');
    expect(result).toContain("reason");
    expect(result).toContain("NÃO envie assignee_id nem team_id");
    expect(result).toContain("escalacao");
  });

  it("com rules e sem assignee/team padrão: não menciona escalação geral", () => {
    const tool = makeTool({
      execution_config: {
        rules: [
          { label: "Unidade A", team_id: 1 },
          { label: "Unidade B", team_id: 2 },
        ],
      },
    });
    const result = enrichChatwootAssignDescription(tool, "");
    expect(result).toContain('"Unidade A"');
    expect(result).toContain("Sempre envie reason");
    expect(result).not.toContain("escalacao");
  });

  it("description vazia com rules: retorna só o routing", () => {
    const tool = makeTool({
      execution_config: { rules: [{ label: "Unidade X", team_id: 7 }] },
    });
    const result = enrichChatwootAssignDescription(tool, "");
    expect(result).not.toMatch(/^\n/);
    expect(result).toContain('"Unidade X"');
  });
});

// ──────────────────────────────────────────────────────────────
// Testes de regressão para os 3 bugs do caso "unidade jm"
// ──────────────────────────────────────────────────────────────

describe("fuzzy matching stopwords (tool-executor logic inline)", () => {
  const FUZZY_STOPWORDS = new Set(["unidade", "para", "com", "que", "uma"]);

  function tokenize(label: string): string[] {
    const norm = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return norm.split(/\s+/).filter((t) => t.length >= 3 && !FUZZY_STOPWORDS.has(t));
  }

  function score(label: string, reason: string): number {
    const reasonNorm = reason.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return tokenize(label).reduce((acc, tok) => acc + (reasonNorm.includes(tok) ? 1 : 0), 0);
  }

  it("'unidade vila haro' NÃO casa com reason 'unidade jm' (stopword unidade)", () => {
    // Antes do fix: score seria 1 (token "unidade" casava)
    // Após o fix: "unidade" é stopword, tokens são apenas ["vila", "haro"] → score 0
    expect(score("unidade vila haro", "me transfira para unidade jm")).toBe(0);
  });

  it("'Vila Haro' casa corretamente quando reason menciona vila haro", () => {
    expect(score("Vila Haro", "quero unidade vila haro")).toBe(2);
  });

  it("'Júlio de Mesquita' casa quando reason tem 'julio' (após expansão de 'jm')", () => {
    // Simula o reason após IDEAL_UNITS_MAP expandir "jm" → "Júlio de Mesquita"
    expect(score("Júlio de Mesquita", "me transfira para unidade Júlio de Mesquita")).toBe(2);
  });

  it("'Coop Zona Norte' casa quando reason menciona 'coop'", () => {
    // tokens: ["coop", "zona", "norte"] — reason só tem "coop" → score 1 (suficiente para ser o maior)
    expect(score("Coop Zona Norte", "quero unidade coop")).toBe(1);
  });

  it("'unidade coop' NÃO ganha por 'unidade' sozinha (stopword)", () => {
    // Reason sem "coop": apenas "unidade" — não deve casar
    expect(score("unidade coop", "me transfere para unidade X")).toBe(0);
  });
});

describe("IDEAL_UNITS_MAP — expansão de abreviações", () => {
  const IDEAL_UNITS_MAP: Record<string, string> = {
    coop: "Coop Zona Norte",
    "zona norte": "Coop Zona Norte",
    "vila haro": "Vila Haro",
    "vila helena": "Vila Helena",
    "júlio de mesquita": "Júlio de Mesquita",
    julio: "Júlio de Mesquita",
    "julio de mesquita": "Júlio de Mesquita",
    jm: "Júlio de Mesquita",
    aparecidinha: "Aparecidinha",
    aparecida: "Aparecidinha",
    centro: "Centro",
  };

  function expand(text: string): string {
    let result = text;
    for (const [alias, canonical] of Object.entries(IDEAL_UNITS_MAP)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
    }
    return result;
  }

  it('"jm" é expandido para "Júlio de Mesquita"', () => {
    expect(expand("me transfira para unidade jm")).toContain("Júlio de Mesquita");
  });

  it('"jm" maiúsculo também é expandido', () => {
    expect(expand("me transfira para JM")).toContain("Júlio de Mesquita");
  });

  it('"coop" é expandido para "Coop Zona Norte"', () => {
    expect(expand("quero unidade coop")).toContain("Coop Zona Norte");
  });

  it('"julio" é expandido para "Júlio de Mesquita"', () => {
    expect(expand("transferir para julio")).toContain("Júlio de Mesquita");
  });

  it("texto sem alias não é alterado", () => {
    expect(expand("me transfira para um atendente")).toBe("me transfira para um atendente");
  });
});

describe("validateOmnibeesArgs — crianças explícitas via ‘somente/apenas/só N adultos’", () => {
  const msgsSomenteAdultos = [
    { role: "user", content: "quero orcamento dia 15 a 18 de maio 2 adultos" },
    { role: "user", content: "keven" },
    { role: "user", content: "somente 2 adultos" },
  ];

  it("‘somente 2 adultos’ conta como situação de crianças informada (0 crianças)", () => {
    expect(userProvidedChildrenStatus(msgsSomenteAdultos)).toBe(true);
    const r = validateOmnibeesArgs(
      { checkIn: "2026-05-15", checkOut: "2026-05-18", adults: 2 },
      msgsSomenteAdultos
    );
    expect(r).toEqual({ ok: true });
  });

  it("‘só 2 adultos’ também libera a validação sem children nos args", () => {
    const msgs = [
      { role: "user", content: "15 a 18 maio" },
      { role: "user", content: "só 2 adultos" },
    ];
    expect(userProvidedChildrenStatus(msgs)).toBe(true);
    expect(
      validateOmnibeesArgs({ checkIn: "2026-05-15", checkOut: "2026-05-18", adults: 2 }, msgs)
    ).toEqual({ ok: true });
  });
});
