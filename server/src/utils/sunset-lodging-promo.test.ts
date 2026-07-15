import { describe, expect, it } from "vitest";
import {
  applySunsetLodgingPromoPrice,
  formatSunsetLodgingPromoQuoteLine,
  isSunsetLodgingPromoEligibleForStay,
  isSunsetLodgingPromoReservationOpen,
} from "./sunset-lodging-promo.js";

describe("sunset-lodging-promo", () => {
  const beforeDeadline = new Date("2026-06-15T15:00:00Z");
  const afterDeadline = new Date("2026-08-01T15:00:00Z");

  it("reserva aberta até 31/07/2026", () => {
    expect(isSunsetLodgingPromoReservationOpen(beforeDeadline)).toBe(true);
    expect(isSunsetLodgingPromoReservationOpen(afterDeadline)).toBe(false);
  });

  it("estadia elegível com check-in até 31/12/2026", () => {
    expect(isSunsetLodgingPromoEligibleForStay("2026-12-31", beforeDeadline)).toBe(true);
    expect(isSunsetLodgingPromoEligibleForStay("2027-01-01", beforeDeadline)).toBe(false);
  });

  it("aplica 25% OFF com arredondamento em centavos", () => {
    expect(applySunsetLodgingPromoPrice(1104)).toBe(828);
    expect(applySunsetLodgingPromoPrice(552)).toBe(414);
    expect(applySunsetLodgingPromoPrice(782)).toBe(586.5);
  });

  it("frase do orçamento cita 25% OFF e validade de reserva até 31/07", () => {
    const line = formatSunsetLodgingPromoQuoteLine();
    expect(line).toMatch(/25% OFF/);
    expect(line).toMatch(/qualquer data de hospedagem/);
    expect(line).toMatch(/31\/07\/2026/);
    expect(line).toMatch(/v[aá]lida somente at[eé] essa data/i);
  });
});
