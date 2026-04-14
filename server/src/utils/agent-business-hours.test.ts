import { describe, it, expect } from "vitest";
import {
  parseTimeToMinutes,
  isAgentBusinessHoursFeatureEnabled,
  isWithinAgentBusinessHours,
  isWithinScheduledBusinessHours,
  getNextBusinessHoursOpenIso,
  type BusinessHours,
} from "./agent-business-hours.js";

function cfg(enabled: boolean, hours: BusinessHours): Record<string, unknown> {
  return { business_hours_enabled: enabled, business_hours: hours };
}

const overnightWeek: BusinessHours = {
  mon: { enabled: true, start: "19:00", end: "08:00" },
  tue: { enabled: true, start: "19:00", end: "08:00" },
  wed: { enabled: true, start: "19:00", end: "08:00" },
  thu: { enabled: true, start: "19:00", end: "08:00" },
  fri: { enabled: true, start: "19:00", end: "08:00" },
  sat: { enabled: true, start: "19:00", end: "08:00" },
  sun: { enabled: true, start: "19:00", end: "08:00" },
};

const weekdayNineToSix: BusinessHours = {
  mon: { enabled: true, start: "09:00", end: "18:00" },
  tue: { enabled: true, start: "09:00", end: "18:00" },
  wed: { enabled: true, start: "09:00", end: "18:00" },
  thu: { enabled: true, start: "09:00", end: "18:00" },
  fri: { enabled: true, start: "09:00", end: "18:00" },
  sat: { enabled: false, start: "09:00", end: "12:00" },
  sun: { enabled: false, start: "09:00", end: "12:00" },
};

describe("isAgentBusinessHoursFeatureEnabled", () => {
  it("aceita boolean true, string true e número 1", () => {
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: true })).toBe(true);
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: "true" })).toBe(true);
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: "TRUE" })).toBe(true);
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: 1 })).toBe(true);
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: false })).toBe(false);
    expect(isAgentBusinessHoursFeatureEnabled({ business_hours_enabled: "false" })).toBe(false);
    expect(isAgentBusinessHoursFeatureEnabled({})).toBe(false);
  });
});

describe("parseTimeToMinutes", () => {
  it("parse válido", () => {
    expect(parseTimeToMinutes("08:30")).toBe(8 * 60 + 30);
    expect(parseTimeToMinutes("19:00")).toBe(19 * 60);
  });
  it("inválido", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
  });
});

describe("isWithinAgentBusinessHours", () => {
  it("desabilitado: sempre true", () => {
    const c = cfg(false, weekdayNineToSix);
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T12:00:00.000Z"))).toBe(true);
  });

  it("dia útil 09–18: dentro e fora (BRT)", () => {
    const c = cfg(true, weekdayNineToSix);
    // Seg 13/04/2026 12:00 UTC = 09:00 BRT
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T12:00:00.000Z"))).toBe(true);
    // Seg 13/04/2026 20:00 UTC = 17:00 BRT
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T20:00:00.000Z"))).toBe(true);
    // Seg 13/04/2026 22:00 UTC = 19:00 BRT — fora
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T22:00:00.000Z"))).toBe(false);
  });

  it("noturno 19–08: noite e madrugada seguinte", () => {
    const c = cfg(true, overnightWeek);
    // Seg 13/04/2026 23:00 UTC = 20:00 BRT — dentro
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T23:00:00.000Z"))).toBe(true);
    // Ter 14/04/2026 05:00 UTC = 02:00 BRT — cauda de seg → dentro
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-14T05:00:00.000Z"))).toBe(true);
    // Ter 14/04/2026 14:00 UTC = 11:00 BRT — entre turnos
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-14T14:00:00.000Z"))).toBe(false);
  });

  it("noturno 19–08: exatamente 08:00 BRT no dia seguinte está fora (fim exclusivo)", () => {
    const c = cfg(true, overnightWeek);
    // Ter 14/04/2026 11:00:00 UTC = 08:00:00 BRT — fim da cauda de seg
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-14T11:00:00.000Z"))).toBe(false);
  });

  it("business_hours_enabled como string ainda restringe", () => {
    const c: Record<string, unknown> = { business_hours_enabled: "true", business_hours: overnightWeek };
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-14T14:00:00.000Z"))).toBe(false);
  });

  it("só segunda noturna: terça 11h BRT fora", () => {
    const onlyMon: BusinessHours = {
      ...overnightWeek,
      tue: { enabled: false, start: "19:00", end: "08:00" },
      wed: { enabled: false, start: "19:00", end: "08:00" },
      thu: { enabled: false, start: "19:00", end: "08:00" },
      fri: { enabled: false, start: "19:00", end: "08:00" },
      sat: { enabled: false, start: "19:00", end: "08:00" },
      sun: { enabled: false, start: "19:00", end: "08:00" },
    };
    const c = cfg(true, onlyMon);
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-14T14:00:00.000Z"))).toBe(false);
  });

  it("domingo→segunda: cauda de domingo na segunda de manhã", () => {
    const hours: BusinessHours = {
      mon: { enabled: false, start: "09:00", end: "18:00" },
      tue: { enabled: false, start: "09:00", end: "18:00" },
      wed: { enabled: false, start: "09:00", end: "18:00" },
      thu: { enabled: false, start: "09:00", end: "18:00" },
      fri: { enabled: false, start: "09:00", end: "18:00" },
      sat: { enabled: false, start: "09:00", end: "18:00" },
      sun: { enabled: true, start: "19:00", end: "08:00" },
    };
    const c = cfg(true, hours);
    // Seg 13/04/2026 10:00 UTC = 07:00 BRT — ainda na cauda de domingo 19→08
    expect(isWithinAgentBusinessHours(c, new Date("2026-04-13T10:00:00.000Z"))).toBe(true);
  });
});

describe("getNextBusinessHoursOpenIso", () => {
  it("retorna null se horário comercial desligado", () => {
    expect(getNextBusinessHoursOpenIso(cfg(false, weekdayNineToSix), new Date("2026-04-13T22:00:00.000Z"))).toBeNull();
  });

  it("próxima abertura após expediente 09–18", () => {
    const c = cfg(true, weekdayNineToSix);
    const from = new Date("2026-04-13T22:00:00.000Z"); // seg 19h BRT — fora
    const next = getNextBusinessHoursOpenIso(c, from);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(isWithinScheduledBusinessHours(c, nextDate)).toBe(true);
    expect(nextDate.getTime()).toBeGreaterThan(from.getTime());
  });
});
