import { describe, expect, it } from "vitest";
import { assertLotTransition, canTransitionLotStatus, parseLotStatus } from "./lot-status.js";

describe("lot-status", () => {
  it("parseLotStatus", () => {
    expect(parseLotStatus("available")).toBe("available");
    expect(parseLotStatus("invalid")).toBeNull();
  });

  it("available pode reservar ou bloquear", () => {
    expect(canTransitionLotStatus("available", "reserved")).toBe(true);
    expect(canTransitionLotStatus("available", "blocked")).toBe(true);
    expect(canTransitionLotStatus("sold", "reserved")).toBe(false);
  });

  it("reserved pode vender ou liberar", () => {
    expect(canTransitionLotStatus("reserved", "sold")).toBe(true);
    expect(canTransitionLotStatus("reserved", "available")).toBe(true);
  });

  it("sold só reabre com available", () => {
    expect(canTransitionLotStatus("sold", "available")).toBe(true);
    expect(() => assertLotTransition("sold", "reserved")).toThrow(/invalid_lot_status_transition/);
  });
});
