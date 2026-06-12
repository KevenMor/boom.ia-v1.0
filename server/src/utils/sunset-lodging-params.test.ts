import { describe, it, expect } from "vitest";
import {
  assistantAskedGuestComposition,
  detectSunsetLodgingInterestKeywords,
  extractSunsetLodgingParams,
  parseExplicitGuestCount,
  shouldReinvokeSunsetLodging,
  userAsksSunsetLodgingCategoryOrPrice,
} from "./sunset-lodging-params.js";

describe("parseExplicitGuestCount", () => {
  it("interpreta 'duas apenas' como 2", () => {
    expect(parseExplicitGuestCount("duas apenas")).toBe(2);
  });

  it("interpreta '2 pessoas' como 2", () => {
    expect(parseExplicitGuestCount("hospedagem para 2 pessoas")).toBe(2);
  });

  it("não infere de contexto vago", () => {
    expect(parseExplicitGuestCount("dia dos namorados")).toBeNull();
  });
});

describe("extractSunsetLodgingParams — caso Dia dos Namorados + duas pessoas", () => {
  const ref = new Date("2026-06-10T12:00:00Z");

  const messages = [
    { role: "user", content: "ola" },
    { role: "assistant", content: "Como prefere ser chamado?" },
    { role: "user", content: "keven" },
    { role: "assistant", content: "Prazer, Keven. Você quer saber sobre parque, hospedagem ou os dois?" },
    { role: "user", content: "hospedagem para o dia dos namorados" },
    {
      role: "assistant",
      content: "Ótima pedida! O Dia dos Namorados é 12/06. Para a hospedagem, quantas pessoas vão?",
    },
    { role: "user", content: "duas apenas" },
  ];

  it("extrai check-in 12/06, checkout domingo 14/06 e 2 adultos", () => {
    expect(assistantAskedGuestComposition(messages)).toBe(true);
    const params = extractSunsetLodgingParams(messages, ref);
    expect(params).toEqual({
      check_in: "2026-06-12",
      check_out: "2026-06-14",
      guests: [{ type: "adult" }, { type: "adult" }],
    });
  });

  it("retorna null sem composição explícita", () => {
    const withoutGuests = messages.slice(0, -1);
    expect(extractSunsetLodgingParams(withoutGuests, ref)).toBeNull();
  });
});

describe("Loft / hidromassagem — reconsulta", () => {
  const priorToolResult = JSON.stringify({
    status: "success",
    available_accommodations: [
      { name: "STANDART", total_price: 1104 },
      { name: "LUXO DUPLO", total_price: 1564 },
    ],
  });

  const messagesWithLoftQuestion = [
    { role: "user", content: "hospedagem para o dia dos namorados" },
    {
      role: "assistant",
      content: "Ótima pedida! O Dia dos Namorados é 12/06. Para a hospedagem, quantas pessoas vão?",
    },
    { role: "user", content: "final de semana todo e para duas pessoas apenas" },
    { role: "assistant", content: "Opções: Standart, Luxo Duplo..." },
    { role: "user", content: "gostei, tem algum suite que tem hidromassagem?" },
  ];

  it("detecta interesse loft/hidromassagem", () => {
    expect(detectSunsetLodgingInterestKeywords("tem suite com hidromassagem?")).toContain("hidromassagem");
  });

  it("exige reconsulta quando Loft não estava no resultado anterior", () => {
    expect(userAsksSunsetLodgingCategoryOrPrice(messagesWithLoftQuestion)).toBe(true);
    expect(shouldReinvokeSunsetLodging(messagesWithLoftQuestion, [priorToolResult])).toBe(true);
  });

  it("inclui interest_keywords nos params quando cliente pergunta loft", () => {
    const params = extractSunsetLodgingParams(messagesWithLoftQuestion, new Date("2026-06-10T12:00:00Z"));
    expect(params).not.toBeNull();
    expect(params!.interest_keywords).toContain("hidromassagem");
  });
});

describe("extractSunsetLodgingParams — datas explícitas", () => {
  it("usa check-in e check-out informados", () => {
    const params = extractSunsetLodgingParams(
      [
        { role: "user", content: "quero hospedagem de 16/05/2026 a 17/05/2026 para 2 adultos" },
      ],
      new Date("2026-05-01T12:00:00Z")
    );
    expect(params).toEqual({
      check_in: "2026-05-16",
      check_out: "2026-05-17",
      guests: [{ type: "adult" }, { type: "adult" }],
    });
  });
});
