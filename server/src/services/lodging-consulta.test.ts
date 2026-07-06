import { describe, expect, it } from "vitest";
import {
  buildOpenParkRangeSuggestions,
  findNearestOpenLodgingWindowFromRows,
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
