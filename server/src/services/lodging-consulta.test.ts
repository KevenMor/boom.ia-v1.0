import { describe, expect, it } from "vitest";
import {
  buildOpenParkRangeSuggestions,
  findNearestOpenLodgingWindowFromRows,
  accommodationListNeedsLoftSupplement,
  computeLodgingGroupPrice,
  computeSunsetLodgingGuestPricing,
  formatSunsetChildrenCourtesyMessage,
} from "./lodging-consulta.js";

describe("findNearestOpenLodgingWindowFromRows", () => {
  const rows = [
    { calendar_date: "2026-05-16", day_kind: "fechado" },
    { calendar_date: "2026-05-17", day_kind: "fechado" },
    { calendar_date: "2026-05-18", day_kind: "aberto" },
    { calendar_date: "2026-05-19", day_kind: "aberto" },
    { calendar_date: "2026-05-20", day_kind: "fechado" },
    { calendar_date: "2026-05-21", day_kind: "aberto" },
    { calendar_date: "2026-05-22", day_kind: "aberto" },
  ];

  it("retorna primeira janela com N noites consecutivas abertas", () => {
    expect(findNearestOpenLodgingWindowFromRows(rows, 1, "2026-05-16")).toEqual({
      check_in: "2026-05-18",
      check_out: "2026-05-19",
      nights: 1,
    });
  });

  it("respeita nº de noites (2 noites)", () => {
    expect(findNearestOpenLodgingWindowFromRows(rows, 2, "2026-05-16")).toEqual({
      check_in: "2026-05-18",
      check_out: "2026-05-20",
      nights: 2,
    });
  });

  it("pula janela com dia fechado no meio", () => {
    expect(findNearestOpenLodgingWindowFromRows(rows, 2, "2026-05-20")).toEqual({
      check_in: "2026-05-21",
      check_out: "2026-05-23",
      nights: 2,
    });
  });

  it("retorna null se não houver janela", () => {
    expect(findNearestOpenLodgingWindowFromRows(rows, 3, "2026-05-16")).toBeNull();
  });
});

describe("buildOpenParkRangeSuggestions", () => {
  const julyRows = [
    { calendar_date: "2026-07-18", day_kind: "aberto" },
    { calendar_date: "2026-07-19", day_kind: "aberto" },
    { calendar_date: "2026-07-20", day_kind: "fechado" },
    { calendar_date: "2026-07-25", day_kind: "aberto" },
    { calendar_date: "2026-07-26", day_kind: "aberto" },
    { calendar_date: "2026-07-27", day_kind: "fechado" },
  ];

  it("não inclui dia fechado como fim do intervalo aberto", () => {
    expect(buildOpenParkRangeSuggestions(julyRows)).toEqual([
      "Parque aberto: 18/07/2026 a 19/07/2026",
      "Parque aberto: 25/07/2026 a 26/07/2026",
    ]);
  });

  it("dia único aberto antes de fechado", () => {
    expect(
      buildOpenParkRangeSuggestions([
        { calendar_date: "2026-07-18", day_kind: "aberto" },
        { calendar_date: "2026-07-19", day_kind: "fechado" },
      ])
    ).toEqual(["Parque aberto: 18/07/2026"]);
  });
});

describe("accommodationListNeedsLoftSupplement", () => {
  it("retorna true quando Loft não está na lista", () => {
    expect(
      accommodationListNeedsLoftSupplement([
        { name: "STANDART" },
        { name: "LUXO DUPLO" },
      ])
    ).toBe(true);
  });

  it("retorna false quando LOFT ou SPA já está na lista", () => {
    expect(accommodationListNeedsLoftSupplement([{ name: "LOFT" }])).toBe(false);
    expect(accommodationListNeedsLoftSupplement([{ name: "LOFT PREMIUM COM SPA" }])).toBe(false);
  });
});

describe("computeLodgingGroupPrice", () => {
  it("multiplica tarifa por unidade × quartos e aplica promo no total do grupo", () => {
    const priced = computeLodgingGroupPrice(3036, 3, 1, true);
    expect(priced.listTotal).toBe(9108);
    expect(priced.promoTotal).toBe(6831);
    expect(priced.promoUnitTotal).toBe(2277);
  });

  it("1 quarto mantém total igual à tarifa unitária", () => {
    const priced = computeLodgingGroupPrice(1104, 1, 1, true);
    expect(priced.listTotal).toBe(1104);
    expect(priced.promoTotal).toBe(828);
  });
});

describe("computeSunsetLodgingGuestPricing — cortesia crianças", () => {
  const adults = Array.from({ length: 8 }, () => ({ type: "adult" as const }));

  it("10 pessoas (8 adultos + 2 crianças 3 e 10) = 9 pagantes e 3 quartos", () => {
    const guests = [
      ...adults,
      { type: "child" as const, age: 3 },
      { type: "child" as const, age: 10 },
    ];
    const p = computeSunsetLodgingGuestPricing(guests);
    expect(p.guestsFamilyTotal).toBe(10);
    expect(p.guestsForPricing).toBe(9);
    expect(p.allChildrenCourtesy).toBe(false);
    expect(p.childrenCourtesyCount).toBe(1);
    expect(p.roomsInQuote).toBe(3);
  });

  it("2 adultos + 2 crianças (3 e 5) soma 8 = todas cortesia → 2 pagantes", () => {
    const guests = [
      { type: "adult" as const },
      { type: "adult" as const },
      { type: "child" as const, age: 3 },
      { type: "child" as const, age: 5 },
    ];
    const p = computeSunsetLodgingGuestPricing(guests);
    expect(p.guestsForPricing).toBe(2);
    expect(p.allChildrenCourtesy).toBe(true);
    expect(p.childrenCourtesyCount).toBe(2);
  });

  it("mensagem de cortesia parcial quando soma > 12", () => {
    const p = computeSunsetLodgingGuestPricing([
      ...adults,
      { type: "child", age: 3 },
      { type: "child", age: 10 },
    ]);
    expect(formatSunsetChildrenCourtesyMessage(p)).toMatch(/1 criança até 12 anos em cortesia/);
    expect(formatSunsetChildrenCourtesyMessage(p)).toMatch(/soma das idades/);
  });
});
