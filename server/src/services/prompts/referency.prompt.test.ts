import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./referency.js";
import { getPromptConfig } from "./registry.js";

describe("Referency — SYSTEM_PROMPT (Amanda)", () => {
  it("obriga primeira mensagem a terminar com pergunta objetiva", () => {
    expect(SYSTEM_PROMPT).toMatch(/TRAVA OBRIGATÓRIA ANTES DE ENVIAR A PRIMEIRA MENSAGEM/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA pode terminar só em apresentação|frase vaga/i);
    expect(SYSTEM_PROMPT).toMatch(/deve terminar com exatamente 1 pergunta objetiva/i);
    expect(SYSTEM_PROMPT).toMatch(/Se a mensagem gerada não tiver ponto de interrogação, REESCREVA/i);
  });

  it("captura nome no primeiro contato quando o cliente ainda não informou", () => {
    expect(SYSTEM_PROMPT).toMatch(/Como posso te chamar\?/);
    expect(SYSTEM_PROMPT).toMatch(/Antes de eu te passar os detalhes, como posso te chamar\?/);
  });

  it("avança para qualificação de veículo se o cliente já informou o nome", () => {
    expect(SYSTEM_PROMPT).toMatch(/se o cliente já informou o nome na primeira mensagem/i);
    expect(SYSTEM_PROMPT).toMatch(/Qual veículo você está buscando\?/);
    expect(SYSTEM_PROMPT).toMatch(/Você já tem algum modelo em mente\?/);
  });

  it("mantém versão do prompt registrada", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.6\.1/);
    expect(getPromptConfig("referency")?.version).toBe("v1.6.1");
  });
});
