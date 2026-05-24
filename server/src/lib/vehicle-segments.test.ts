import { describe, expect, it } from "vitest";
import {
  classifyVehicleSegments,
  resolveSegmentFilter,
  vehicleMatchesSegment,
} from "./vehicle-segments.js";

describe("classifyVehicleSegments", () => {
  it("classifica Porsche Panamera Turbo S como esportivo e premium", () => {
    const segments = classifyVehicleSegments({
      brand: "PORSCHE",
      model: "PANAMERA",
      version: "4.0 V8 TURBO S E-HYBRID",
      fuel_type: "Híbrido",
    });
    expect(segments).toContain("esportivo");
    expect(segments).toContain("premium");
    expect(segments).toContain("hibrido");
  });

  it("classifica Hilux como picape", () => {
    expect(classifyVehicleSegments({ brand: "TOYOTA", model: "HILUX", version: "SRX" })).toContain("picape");
  });

  it("classifica Compass como suv", () => {
    expect(classifyVehicleSegments({ brand: "JEEP", model: "COMPASS", version: "Longitude" })).toContain("suv");
  });
});

describe("resolveSegmentFilter", () => {
  it("resolve pegada esportiva", () => {
    expect(resolveSegmentFilter("pegada esportiva")).toBe("esportivo");
    expect(resolveSegmentFilter("algo com pegada mais esportiva")).toBe("esportivo");
  });
});

describe("vehicleMatchesSegment", () => {
  it("Panamera bate filtro esportivo", () => {
    expect(
      vehicleMatchesSegment(
        { brand: "PORSCHE", model: "PANAMERA", version: "4.0 V8 TURBO S E-HYBRID" },
        "esportivo"
      )
    ).toBe(true);
  });
});
