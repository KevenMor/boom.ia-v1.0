import { describe, expect, it } from "vitest";
import {
  extractSunsetParkParams,
  extractSunsetParkParamsForThermasCard,
  messageDeclaresParkTicketPriceQuestion,
  shouldAutoInvokeParkForThermasCard,
  userAsksSunsetParkConsultation,
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
});
