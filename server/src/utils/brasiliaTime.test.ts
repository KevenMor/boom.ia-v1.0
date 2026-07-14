import { describe, expect, it } from "vitest";
import {
  buildBrasiliaTemporalContext,
  formatBrasiliaGreeting,
  getBrasiliaGreetingPeriod,
  parsePortugueseWeekdayMention,
  brasiliaUpcomingWeekdayIso,
} from "./brasiliaTime.js";

/** 14:30 UTC = 11:30 Brasília (UTC-3) */
const BR_MORNING = new Date("2026-07-11T14:30:00.000Z");
/** 17:00 UTC = 14:00 Brasília */
const BR_AFTERNOON = new Date("2026-07-11T17:00:00.000Z");
/** 23:00 UTC = 20:00 Brasília */
const BR_NIGHT = new Date("2026-07-11T23:00:00.000Z");
/** 07:00 UTC = 04:00 Brasília (madrugada) */
const BR_LATE_NIGHT = new Date("2026-07-11T07:00:00.000Z");
/** Terça 14/07/2026 ~12h Brasília */
const BR_TUE_JUL14 = new Date("2026-07-14T15:00:00.000Z");
/** Sábado 18/07/2026 ~12h Brasília */
const BR_SAT_JUL18 = new Date("2026-07-18T15:00:00.000Z");

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

  it("buildBrasiliaTemporalContext inclui mapa dos próximos 7 dias (Brasília)", () => {
    const ctx = buildBrasiliaTemporalContext(BR_TUE_JUL14);
    expect(ctx).toMatch(/Próximos 7 dias/);
    expect(ctx).toMatch(/sábado=2026-07-18/);
    expect(ctx).toMatch(/domingo=2026-07-19/);
    expect(ctx).toMatch(/America\/Sao_Paulo/);
    expect(ctx).toMatch(/PROIBIDO inventar/);
  });
});

describe("brasiliaTime — dias da semana", () => {
  it("'Sábado agora' em terça 14/07 → sábado 18/07 (não domingo 19)", () => {
    expect(parsePortugueseWeekdayMention("Sábado agora", BR_TUE_JUL14)).toBe("2026-07-18");
    expect(parsePortugueseWeekdayMention("sabado agora", BR_TUE_JUL14)).toBe("2026-07-18");
    expect(parsePortugueseWeekdayMention("esse sábado", BR_TUE_JUL14)).toBe("2026-07-18");
  });

  it("'próximo sábado' quando hoje já é sábado → +7", () => {
    expect(parsePortugueseWeekdayMention("próximo sábado", BR_SAT_JUL18)).toBe("2026-07-25");
    expect(brasiliaUpcomingWeekdayIso(6, BR_SAT_JUL18, { includeToday: false })).toBe("2026-07-25");
  });

  it("'próximo sábado' na terça → este sábado da semana", () => {
    expect(parsePortugueseWeekdayMention("próximo sábado", BR_TUE_JUL14)).toBe("2026-07-18");
  });
});
