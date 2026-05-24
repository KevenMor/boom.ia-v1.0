import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./referency.js";
import { getPromptConfig } from "./registry.js";

describe("Referency — SYSTEM_PROMPT (Amanda)", () => {
  it("obriga primeira mensagem a terminar com pergunta objetiva", () => {
    expect(SYSTEM_PROMPT).toMatch(/TRAVA OBRIGATÓRIA ANTES DE ENVIAR A PRIMEIRA MENSAGEM/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA pode terminar só em apresentação|frase vaga/i);
    expect(SYSTEM_PROMPT).toMatch(/deve terminar com exatamente 1 pergunta objetiva/i);
    expect(SYSTEM_PROMPT).toMatch(/PERGUNTAS VAGAS PROIBIDAS no primeiro contato/i);
    expect(SYSTEM_PROMPT).toMatch(/Como posso ajudar\?|Em que posso ajudar\?|Posso te ajudar\?/i);
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

  it("não permite afirmar estoque sem ESTOQUE ATUAL após o cliente informar o nome", () => {
    expect(SYSTEM_PROMPT).toMatch(/Antes de falar de preço, disponibilidade, versão, cor, km ou dizer que "temos" alguma opção/i);
    expect(SYSTEM_PROMPT).toMatch(/Sem esse bloco, NÃO afirme estoque/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA invente "temos algumas opções"/i);
  });

  it("mantém versão do prompt registrada", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.6\.4/);
    expect(getPromptConfig("referency")?.version).toBe("v1.6.4");
  });

  it("obriga fotos antes do texto na entrega de imagens", () => {
    expect(SYSTEM_PROMPT).toMatch(/ORDEM DE ENTREGA \(OBRIGATÓRIA — v1\.6\.4\)/i);
    expect(SYSTEM_PROMPT).toMatch(/SEM nenhum texto antes das fotos/i);
    expect(SYSTEM_PROMPT).toMatch(/somente depois.*bloco de imagens/i);
  });
});
