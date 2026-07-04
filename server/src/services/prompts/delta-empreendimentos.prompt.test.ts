import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  getPromptConfig,
} from "./registry.js";
import {
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
  SYSTEM_PROMPT,
} from "./delta-empreendimentos.js";

describe("Delta Empreendimentos — SYSTEM_PROMPT", () => {
  it("versão do prompt", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.1\.0/);
  });

  it("identidade Sara e empresa", () => {
    expect(SYSTEM_PROMPT).toMatch(/Sara/i);
    expect(SYSTEM_PROMPT).toMatch(/Delta Empreendimentos/i);
    expect(SYSTEM_PROMPT).toMatch(/Araçoiaba da Serra/i);
  });

  it("proíbe inventar nome e uso artificial do nome", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA INVENTAR/i);
    expect(SYSTEM_PROMPT).toMatch(/moderação/i);
    expect(SYSTEM_PROMPT).toMatch(/Proibido.*cada.*mensagem|cada.*frase/i);
  });

  it("proíbe emoji e IA/robô", () => {
    expect(SYSTEM_PROMPT).toMatch(/ZERO EMOJI|Zero emoji/i);
    expect(SYSTEM_PROMPT).toMatch(/rob[oô]|IA/i);
  });

  it("regra 00 — não inventar preço ou disponibilidade", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA INVENTAR DADOS COMERCIAIS/i);
    expect(SYSTEM_PROMPT).toMatch(/disponibilidade/i);
  });

  it("prioriza leads de anúncio", () => {
    expect(SYSTEM_PROMPT).toMatch(/anúncio/i);
    expect(SYSTEM_PROMPT).toMatch(/Regra de ouro/i);
    expect(SYSTEM_PROMPT).toMatch(/Cenário B/i);
  });

  it("cita empreendimentos do portfólio", () => {
    expect(SYSTEM_PROMPT).toMatch(/Reservas do Brasil/i);
    expect(SYSTEM_PROMPT).toMatch(/Dallas/i);
    expect(SYSTEM_PROMPT).toMatch(/Vista Alegre/i);
  });

  it("sem telefone hardcoded no prompt", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\+55\s*\(?\d{2}\)?/);
    expect(SYSTEM_PROMPT).not.toMatch(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/);
  });
});

describe("Delta Empreendimentos — DISPATCHER, COMM e FOLLOWUP", () => {
  it("dispatcher sem tools obrigatórias", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
  });

  it("communication rules proíbem emoji e inventar nome", () => {
    expect(COMMUNICATION_RULES).toMatch(/Zero emoji/i);
    expect(COMMUNICATION_RULES).toMatch(/Nunca inventar nome/i);
  });

  it("follow-up sem preço inventado", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/Proibido.*R\$|Sem preço inventado/i);
  });
});

describe("Delta Empreendimentos — registry", () => {
  it("resolve slug delta-empreendimentos", () => {
    const cfg = getPromptConfig("delta-empreendimentos");
    expect(cfg).not.toBeNull();
    expect(cfg!.version).toBe("v1.1.0");
    expect(cfg!.description).toMatch(/Sara/i);
  });

  it("buildSystemPrompt ignora prompt do banco e injeta Sara", () => {
    const prompt = buildSystemPrompt("PROMPT_BANCO_IGNORAR", "delta-empreendimentos", false);
    expect(prompt).toContain("Sara");
    expect(prompt).toContain("v1.1.0");
    expect(prompt).not.toContain("PROMPT_BANCO_IGNORAR");
    expect(prompt).not.toContain("COMPORTAMENTO DE SAUDAÇÃO:");
  });

  it("resolve alias delta_empreendimentos", () => {
    const prompt = buildSystemPrompt("BANCO", "delta_empreendimentos", false);
    expect(prompt).toContain("Sara");
    expect(prompt).not.toContain("BANCO");
  });
});
