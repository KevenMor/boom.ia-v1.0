import { describe, expect, it } from "vitest";
import {
  buildConsolidatedUserMessageForLlm,
  consolidateBufferedUserMessages,
} from "./message-debounce.js";

describe("consolidateBufferedUserMessages", () => {
  it("une fragmentos curtos com espaço (correção/autocompletar)", () => {
    const out = consolidateBufferedUserMessages([
      "pode me mandar as foto amanha",
      "amanda",
    ]);
    expect(out).toBe("pode me mandar as foto amanha amanda");
  });

  it("mantém mensagem única inalterada", () => {
    expect(consolidateBufferedUserMessages(["oi"])).toBe("oi");
  });

  it("usa parágrafo duplo para mensagens longas", () => {
    const longA = "A".repeat(130);
    const out = consolidateBufferedUserMessages([longA, "segunda parte"]);
    expect(out).toBe(`${longA}\n\nsegunda parte`);
  });
});

describe("buildConsolidatedUserMessageForLlm", () => {
  it("adiciona hint quando há múltiplas mensagens", () => {
    const out = buildConsolidatedUserMessageForLlm([
      "pode me mandar as foto amanha",
      "amanda",
    ]);
    expect(out).toMatch(/Cliente enviou 2 mensagens seguidas/i);
    expect(out).toContain("pode me mandar as foto amanha amanda");
  });

  it("não adiciona hint para mensagem única", () => {
    const out = buildConsolidatedUserMessageForLlm(["só uma"]);
    expect(out).toBe("só uma");
    expect(out).not.toMatch(/mensagens seguidas/i);
  });
});
