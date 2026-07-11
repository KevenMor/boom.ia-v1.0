import { describe, expect, it } from "vitest";
import {
  buildBrasiliaTemporalContext,
  formatBrasiliaGreeting,
  getBrasiliaGreetingPeriod,
} from "./brasiliaTime.js";

/** 14:30 UTC = 11:30 Brasília (UTC-3) */
const BR_MORNING = new Date("2026-07-11T14:30:00.000Z");
/** 17:00 UTC = 14:00 Brasília */
const BR_AFTERNOON = new Date("2026-07-11T17:00:00.000Z");
/** 23:00 UTC = 20:00 Brasília */
const BR_NIGHT = new Date("2026-07-11T23:00:00.000Z");
/** 07:00 UTC = 04:00 Brasília (madrugada) */
const BR_LATE_NIGHT = new Date("2026-07-11T07:00:00.000Z");

describe("brasiliaTime — saudação temporal", () => {
  it("classifica faixas de bom dia, boa tarde e boa noite", () => {
    expect(getBrasiliaGreetingPeriod(BR_MORNING)).toBe("bom_dia");
    expect(getBrasiliaGreetingPeriod(BR_AFTERNOON)).toBe("boa_tarde");
    expect(getBrasiliaGreetingPeriod(BR_NIGHT)).toBe("boa_noite");
    expect(getBrasiliaGreetingPeriod(BR_LATE_NIGHT)).toBe("boa_noite");
  });

  it("formata rótulos de saudação", () => {
    expect(formatBrasiliaGreeting("bom_dia")).toBe("Bom dia!");
    expect(formatBrasiliaGreeting("boa_tarde")).toBe("Boa tarde!");
    expect(formatBrasiliaGreeting("boa_noite")).toBe("Boa noite!");
  });

  it("buildBrasiliaTemporalContext inclui data, amanhã e saudação recomendada", () => {
    const ctx = buildBrasiliaTemporalContext(BR_AFTERNOON);
    expect(ctx).toMatch(/\[CONTEXTO TEMPORAL\]/);
    expect(ctx).toMatch(/Brasília/);
    expect(ctx).toMatch(/Hoje: 2026-07-11/);
    expect(ctx).toMatch(/Amanhã: 2026-07-12/);
    expect(ctx).toMatch(/Saudação recomendada neste horário: Boa tarde!/);
    expect(ctx).toMatch(/05:00–11:59/);
  });
});
