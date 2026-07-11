import { describe, expect, it } from "vitest";
import {
  extractSunsetParkParams,
  extractSunsetParkParamsForThermasCard,
  messageDeclaresParkTicketPriceQuestion,
  shouldAutoInvokeParkForThermasCard,
  userAsksSunsetParkConsultation,
  userAsksThermasCardPricing,
  userConfirmsThermasCardCompositionOnly,
} from "./sunset-park-params.js";

describe("sunset-park-params", () => {
  const ref = new Date("2026-06-12T15:00:00Z");
  const refJul6 = new Date("2026-07-06T15:00:00Z");

  it("detecta pergunta de valor do parque hoje (typo park)", () => {
    const q = "qual valor hoje para ir ao park?";
    expect(messageDeclaresParkTicketPriceQuestion(q)).toBe(true);
    expect(userAsksSunsetParkConsultation([{ role: "user", content: q }])).toBe(true);
  });

  it("extrai data hoje para pergunta de ingresso", () => {
    const params = extractSunsetParkParams(
      [{ role: "user", content: "qual valor hoje para ir ao park?" }],
      ref
    );
    expect(params).toEqual({ date: "2026-06-12" });
  });

  it("não confunde com hospedagem", () => {
    const q = "quero hospedagem para duas pessoas";
    expect(messageDeclaresParkTicketPriceQuestion(q)).toBe(false);
    expect(extractSunsetParkParams([{ role: "user", content: q }], ref)).toBeNull();
  });

  it("Thermas Card + objeção de preço dispara auto consulta de ingresso (hoje)", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o Thermas Card" },
      { role: "assistant", content: "O cartão sai R$ 135,90/mês..." },
      { role: "user", content: "mas achei meio caro" },
    ];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(true);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toEqual({
      date: "2026-07-06",
    });
    expect(userAsksSunsetParkConsultation(messages)).toBe(false);
  });

  it("Thermas Card sem composição nem objeção não dispara auto consulta", () => {
    const messages = [{ role: "user", content: "o que é o Thermas Card?" }];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + confirmação de 5 pessoas (qualificação) não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      { role: "assistant", content: "Quantas pessoas entrariam no plano?" },
      { role: "user", content: "seria 5 pessoas mesmo" },
    ];
    expect(userConfirmsThermasCardCompositionOnly(messages)).toBe(true);
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + fluxo nunca fui + 5 pessoas não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      { role: "assistant", content: "Com que frequência vocês costumam vir?" },
      { role: "user", content: "nunca fui" },
      {
        role: "assistant",
        content: "Quantas pessoas entrariam no plano? São R$ 135,90/mês para até 5.",
      },
      { role: "user", content: "seria 5 pessoas mesmo" },
    ];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + 'qual valor?' não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      {
        role: "assistant",
        content: "O Thermas Card dá acesso ilimitado ao parque por 5 anos. Com que frequência vocês costumam vir?",
      },
      { role: "user", content: "qual valor?" },
    ];
    expect(userAsksThermasCardPricing(messages)).toBe(true);
    expect(userAsksSunsetParkConsultation(messages)).toBe(false);
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParams(messages, refJul6)).toBeNull();
  });
});
