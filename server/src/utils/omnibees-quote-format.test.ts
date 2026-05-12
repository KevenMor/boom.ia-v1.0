import { describe, expect, it } from "vitest";
import {
  adjustOmnibeesSingleRoomClosing,
  formatOmnibeesQuoteForDelivery,
  tightenOmnibeesQuoteSpacing,
} from "./omnibees-quote-format.js";

const SINGLE_ROOM_TOOL = JSON.stringify({
  roomCount: 1,
  summaryText:
    "Período desta consulta: entrada 15/05/2026, saída 18/05/2026 (3 noite(s)).\n" +
    "![Foto - LOFT](https://cdn.example/loft.jpg)\n" +
    "LOFT: TOTAL para 3 noite(s): R$ 8.762,04 (à vista/depósito).",
  rooms: [{ roomName: "LOFT", imageUrl: "https://cdn.example/loft.jpg" }],
});

describe("tightenOmnibeesQuoteSpacing", () => {
  it("remove linha em branco entre capa e preço", () => {
    const raw =
      "![Foto - LOFT](https://cdn.example/loft.jpg)\n\n" +
      "LOFT: TOTAL para 3 noite(s): R$ 8.762,04 (à vista/depósito).";
    expect(tightenOmnibeesQuoteSpacing(raw)).toBe(
      "![Foto - LOFT](https://cdn.example/loft.jpg)\n" +
        "LOFT: TOTAL para 3 noite(s): R$ 8.762,04 (à vista/depósito)."
    );
  });
});

describe("adjustOmnibeesSingleRoomClosing", () => {
  it("substitui pergunta de opção quando só há um quarto", () => {
    expect(
      adjustOmnibeesSingleRoomClosing("Qual opção prefere, Keven?", 1, "LOFT")
    ).toBe("Quer seguir com o LOFT para essas datas, Keven?");
  });

  it("mantém pergunta de opção com vários quartos", () => {
    const question = "Qual opção prefere, Keven?";
    expect(adjustOmnibeesSingleRoomClosing(question, 2, "LOFT")).toBe(question);
  });
});

describe("formatOmnibeesQuoteForDelivery", () => {
  it("agrupa intro, bloco da acomodação e rodapé com MSG_SPLIT", () => {
    const assistantText =
      "Para o período de 15 a 18 de maio, com Pensão Completa, temos o LOFT disponível:\n\n" +
      "![Foto - LOFT](https://cdn.example/loft.jpg)\n\n" +
      "LOFT: TOTAL para 3 noite(s): R$ 8.762,04 (à vista/depósito).\n" +
      "Opção parcelada no cartão: R$ 9.735,60 total para 3 noite(s) (em até 10x).\n\n" +
      "Check-in a partir das 17h e check-out até 14h.\n\n" +
      "Qual opção prefere, Keven?";

    const formatted = formatOmnibeesQuoteForDelivery(assistantText, [SINGLE_ROOM_TOOL]);
    const parts = formatted.split("<<MSG_SPLIT>>");

    expect(parts).toHaveLength(3);
    expect(parts[0]).toContain("Para o período de 15 a 18 de maio");
    expect(parts[1]).toContain("![Foto - LOFT](https://cdn.example/loft.jpg)");
    expect(parts[1]).toContain("LOFT: TOTAL para 3 noite(s)");
    expect(parts[1]).not.toContain("Check-in");
    expect(parts[2]).toContain("Check-in a partir das 17h");
    expect(parts[2]).toContain("Quer seguir com o LOFT para essas datas, Keven?");
    expect(parts[2]).not.toMatch(/qual opção prefere/i);
  });
});
