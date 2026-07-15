import { describe, expect, it } from "vitest";
import {
  appendSunsetConversationContext,
  detectSunsetSiteFormMessage,
} from "./sunset-thermas.js";

describe("Sunset — detectSunsetSiteFormMessage (helper base)", () => {
  it("detecta formulário do site com 3 sinais (frase + rótulo + data)", () => {
    expect(
      detectSunsetSiteFormMessage(
        "Olá! Gostaria de verificar disponibilidade. Acomodação: Chalé Aconchegante. Check-in: 16/05/2026"
      )
    ).toBe(true);
  });

  it("não detecta 'oi' como formulário", () => {
    expect(detectSunsetSiteFormMessage("oi")).toBe(false);
  });
});

describe("Sunset — appendSunsetConversationContext (v1.5.54 gate composição)", () => {
  it("injeta GATE quando hospedagem sem composição de crianças", () => {
    const ctx = appendSunsetConversationContext(
      undefined,
      [
        { role: "user", content: "quero hospedagem" },
        { role: "assistant", content: "Quantas pessoas vão na estadia?" },
        { role: "user", content: "Os chalés sai que valores" },
      ]
    );
    expect(ctx).toMatch(/GATE COMPOSIÇÃO HOSPEDAGEM/);
    expect(ctx).toMatch(/PROIBIDO citar preços|Não chame consultar_hospedagem/i);
  });

  it("não injeta gate em oi sem pedido de hospedagem", () => {
    expect(
      appendSunsetConversationContext("ola", [{ role: "user", content: "oi" }])
    ).toBe("");
  });
});
