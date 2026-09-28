import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "./divino-chale.js";
import { buildSystemPrompt, getPromptConfig } from "./registry.js";

describe("Divino Chalé — SYSTEM_PROMPT", () => {
  it("identifica Lara e Divino Chalé", () => {
    expect(SYSTEM_PROMPT).toMatch(/Lara/i);
    expect(SYSTEM_PROMPT).toMatch(/Divino Chalé/i);
    expect(SYSTEM_PROMPT).toMatch(/v1\.1\.2/);
  });

  it("proíbe template formulário de datas", () => {
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO/i);
    expect(SYSTEM_PROMPT).toMatch(/Data de entrada/i);
    expect(SYSTEM_PROMPT).toMatch(/cópia e cola|copia e cola|formulário|formulario/i);
  });

  it("define tabela oficial e extras", () => {
    expect(SYSTEM_PROMPT).toMatch(/399,99/);
    expect(SYSTEM_PROMPT).toMatch(/449,99/);
    expect(SYSTEM_PROMPT).toMatch(/\+ R\$ 100,00|100,00 por hóspede/i);
    expect(SYSTEM_PROMPT).toMatch(/7 anos/);
    expect(SYSTEM_PROMPT).toMatch(/4 pessoas/);
  });

  it("nome do cliente no máximo uma vez na conversa", () => {
    expect(SYSTEM_PROMPT).toMatch(/Nome do cliente|nome do cliente/i);
    expect(SYSTEM_PROMPT).toMatch(/no máximo UMA vez|máximo UMA vez|máx\. 1x/i);
    expect(COMMUNICATION_RULES).toMatch(/Nome do cliente no máximo 1 vez/i);
  });

  it("pergunta idade da criança antes de fechar orçamento", () => {
    expect(SYSTEM_PROMPT).toMatch(/CRIANÇA NO ORÇAMENTO|CRIANCA NO ORCAMENTO/i);
    expect(SYSTEM_PROMPT).toMatch(/Qual a idade/i);
    expect(SYSTEM_PROMPT).toMatch(/se tiver menos de 7/i);
    expect(COMMUNICATION_RULES).toMatch(/perguntar a idade/i);
  });

  it("disponibilidade só via handoff — sem inventar ocupado/livre", () => {
    expect(SYSTEM_PROMPT).toMatch(/já está reservado/i);
    expect(SYSTEM_PROMPT).toMatch(/handoff/i);
    expect(COMMUNICATION_RULES).toMatch(/Disponibilidade → sempre handoff/i);
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
    expect(DISPATCHER_PROMPT).toMatch(/consultar_evento|calendar_query/i);
  });

  it("pets não permitidos e cancelamento via handoff", () => {
    expect(SYSTEM_PROMPT).toMatch(/Pets: NÃO permitidos|não permitidos/i);
    expect(SYSTEM_PROMPT).toMatch(/Cancelamento ou remanejamento/i);
    expect(SYSTEM_PROMPT).toMatch(/handoff|passar pra (nossa )?equipe|passar para/i);
  });

  it("máximo uma pergunta e saudação progressiva", () => {
    expect(SYSTEM_PROMPT).toMatch(/UMA pergunta/i);
    expect(SYSTEM_PROMPT).toMatch(/SAUDAÇÃO SIMPLES|SAUDACAO SIMPLES/i);
  });

  it("Vitória da Conquista / Lagoa das Flores", () => {
    expect(SYSTEM_PROMPT).toMatch(/Vitória da Conquista/i);
    expect(SYSTEM_PROMPT).toMatch(/Lagoa das Flores/i);
  });
});

describe("Divino Chalé — registry", () => {
  it("resolve slug divino-chale com skipGreeting", () => {
    const cfg = getPromptConfig("divino-chale");
    expect(cfg?.version).toBe("v1.1.2");
    expect(cfg?.skipGreeting).toBe(true);
    expect(cfg?.alwaysInjectCommRules).toBe(true);
  });

  it("buildSystemPrompt não injeta BASE_GREETING genérico", () => {
    const out = buildSystemPrompt("", "divino-chale", false);
    expect(out).toContain("LARA | DIVINO CHALÉ");
    expect(out).not.toMatch(/COMPORTAMENTO DE SAUDAÇÃO/);
    expect(out).toMatch(/REGRAS DE COMUNICAÇÃO — LARA/i);
  });

  it("override no banco usa prompt do agente", () => {
    const custom = "PROMPT OVERRIDE TESTE DIVINO";
    const out = buildSystemPrompt(custom, "divino-chale", false, { overridePrompts: true });
    expect(out).toContain(custom);
    expect(out).not.toContain("LARA | DIVINO CHALÉ — v1.1.2");
  });
});

describe("Divino Chalé — demais exports", () => {
  it("dispatcher sem tools", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
  });

  it("followup e comm rules existem", () => {
    expect(COMMUNICATION_RULES.length).toBeGreaterThan(40);
    expect(FOLLOWUP_PROMPT).toMatch(/Lara/i);
    expect(FOLLOWUP_PROMPT).toMatch(/\{attempt\}/);
  });
});
