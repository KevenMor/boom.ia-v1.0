import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  eventOverlapsStay,
  findLodgingConflicts,
  findNextAvailableLodgingNights,
  isLodgingAvailabilityAction,
  isLodgingDeleteAction,
  isLodgingSuggestDatesAction,
  parseLodgingStayArgs,
  parseLodgingSuggestArgs,
  pickLodgingCalendars,
} from "./lodging-calendar-availability.js";

describe("parseLodgingStayArgs", () => {
  it("lê check_in / check_out", () => {
    expect(parseLodgingStayArgs({ check_in: "2026-10-03", check_out: "2026-10-04" })).toEqual({
      checkIn: "2026-10-03",
      checkOut: "2026-10-04",
    });
  });

  it("uma noite só com date → check_out = +1 dia", () => {
    expect(parseLodgingStayArgs({ date: "2026-10-03" })).toEqual({
      checkIn: "2026-10-03",
      checkOut: "2026-10-04",
    });
  });

  it("check_out <= check_in → força +1 dia", () => {
    expect(parseLodgingStayArgs({ check_in: "2026-10-03", check_out: "2026-10-03" })).toEqual({
      checkIn: "2026-10-03",
      checkOut: "2026-10-04",
    });
  });

  it("args inválidos → null", () => {
    expect(parseLodgingStayArgs({})).toBeNull();
    expect(parseLodgingStayArgs({ check_in: "03/10" })).toBeNull();
  });
});

describe("eventOverlapsStay", () => {
  const stay = { checkIn: "2026-10-03", checkOut: "2026-10-04" };

  it("evento all-day no dia da entrada bloqueia", () => {
    expect(
      eventOverlapsStay(
        { start_at: "2026-10-03T00:00:00-03:00", end_at: "2026-10-04T00:00:00-03:00", all_day: true },
        stay,
      ),
    ).toBe(true);
  });

  it("evento em outro fim de semana não bloqueia", () => {
    expect(
      eventOverlapsStay(
        { start_at: "2026-10-10T00:00:00-03:00", end_at: "2026-10-12T00:00:00-03:00" },
        stay,
      ),
    ).toBe(false);
  });

  it("evento que termina no check-in (exclusive) não bloqueia", () => {
    expect(
      eventOverlapsStay(
        { start_at: "2026-10-01T00:00:00-03:00", end_at: "2026-10-03T00:00:00-03:00" },
        stay,
      ),
    ).toBe(false);
  });
});

describe("findLodgingConflicts / pickLodgingCalendars", () => {
  it("filtra só conflitos", () => {
    const conflicts = findLodgingConflicts(
      [
        { id: "1", title: "Reserva A", start_at: "2026-10-03T14:00:00-03:00", end_at: "2026-10-04T11:00:00-03:00" },
        { id: "2", title: "Outra", start_at: "2026-11-01T14:00:00-03:00", end_at: "2026-11-02T11:00:00-03:00" },
      ],
      { checkIn: "2026-10-03", checkOut: "2026-10-04" },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe("1");
  });

  it("prefere calendário Chalé Divino", () => {
    const picked = pickLodgingCalendars([
      { id: "a", name: "Agenda — Rafael" },
      { id: "b", name: "Chalé Divino" },
    ]);
    expect(picked.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("isLodgingAvailabilityAction", () => {
  it("true com check_in/out ou action lodging", () => {
    expect(isLodgingAvailabilityAction("check_availability", { check_in: "2026-10-03", check_out: "2026-10-04" })).toBe(
      true,
    );
    expect(isLodgingAvailabilityAction("check_lodging", {})).toBe(true);
  });

  it("false para check_availability puro sem datas de estadia", () => {
    expect(isLodgingAvailabilityAction("check_availability", { days_ahead: 3 })).toBe(false);
  });

  it("false para excluir/cancelar mesmo com datas", () => {
    expect(
      isLodgingAvailabilityAction("excluir", { check_in: "2026-10-03", check_out: "2026-10-04" }),
    ).toBe(false);
    expect(isLodgingAvailabilityAction("cancelar", { check_in: "2026-10-03", check_out: "2026-10-04" })).toBe(false);
  });
});

describe("isLodgingDeleteAction", () => {
  it("reconhece excluir/remover/cancelar/delete", () => {
    expect(isLodgingDeleteAction("excluir")).toBe(true);
    expect(isLodgingDeleteAction("remover")).toBe(true);
    expect(isLodgingDeleteAction("check_lodging")).toBe(false);
  });
});

describe("sugerir_datas / findNextAvailableLodgingNights", () => {
  it("reconhece action sugerir_datas e não confunde com check_lodging", () => {
    expect(isLodgingSuggestDatesAction("sugerir_datas")).toBe(true);
    expect(isLodgingSuggestDatesAction("find_next_available")).toBe(true);
    expect(isLodgingAvailabilityAction("sugerir_datas", {})).toBe(false);
  });

  it("limita a 3 e pula noites ocupadas", () => {
    const events = [
      { start_at: "2026-10-02T00:00:00-03:00", end_at: "2026-10-03T00:00:00-03:00" },
      { start_at: "2026-10-03T00:00:00-03:00", end_at: "2026-10-04T00:00:00-03:00" },
    ];
    const suggested = findNextAvailableLodgingNights(events, {
      fromDate: "2026-10-02",
      preference: "any",
      limit: 3,
      nights: 1,
      searchDays: 14,
    });
    expect(suggested).toHaveLength(3);
    expect(suggested[0].check_in).toBe("2026-10-04");
    expect(suggested.every((s) => s.check_out > s.check_in)).toBe(true);
  });

  it("preference weekend só sex/sáb/dom", () => {
    const suggested = findNextAvailableLodgingNights([], {
      fromDate: "2026-10-05", // segunda
      preference: "weekend",
      limit: 3,
      nights: 1,
      searchDays: 21,
    });
    expect(suggested.length).toBeGreaterThan(0);
    for (const s of suggested) {
      const dow = new Date(`${s.check_in}T12:00:00.000Z`).getUTCDay();
      expect([0, 5, 6]).toContain(dow);
    }
  });

  it("parseLodgingSuggestArgs força limit <= 3", () => {
    const opts = parseLodgingSuggestArgs({ preference: "weekend", limit: 99 }, "2026-10-01");
    expect(opts.limit).toBe(3);
    expect(opts.preference).toBe("weekend");
    expect(opts.fromDate).toBe("2026-10-01");
  });
});

describe("addDaysIso", () => {
  it("soma dias em BRT", () => {
    expect(addDaysIso("2026-10-03", 1)).toBe("2026-10-04");
  });
});
