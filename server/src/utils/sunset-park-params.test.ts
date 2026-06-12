import { describe, expect, it } from "vitest";
import {
  extractSunsetParkParams,
  messageDeclaresParkTicketPriceQuestion,
  userAsksSunsetParkConsultation,
} from "./sunset-park-params.js";

describe("sunset-park-params", () => {
  const ref = new Date("2026-06-12T15:00:00Z");

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
});
