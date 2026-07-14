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

describe("Sunset — appendSunsetConversationContext (v1.5.50 sem runtime)", () => {
  it("não injeta mais blocos de modo/bloqueio — LLM usa histórico + prompt", () => {
    expect(
      appendSunsetConversationContext(
        "Olá! Gostaria de verificar disponibilidade para hospedagem. Check-in: 18/07/2026",
        [{ role: "user", content: "oi" }]
      )
    ).toBe("");
  });
});
