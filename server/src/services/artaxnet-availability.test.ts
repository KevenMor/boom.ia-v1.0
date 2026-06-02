import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSummaryText,
  computeOtaApproximatePrice,
  normalizeArtaxnetCheckTime,
  normalizeToArtaxnetQueryDate,
  parseArtaxnetRoomsResponse,
} from "./artaxnet-availability.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/artaxnet-rooms-sample.json"), "utf8")
);

describe("artaxnet-availability — datas e horários", () => {
  it("normaliza YYYY-MM-DD para query yyyy/MM/dd", () => {
    expect(normalizeToArtaxnetQueryDate("2026-06-10")).toBe("2026/06/10");
    expect(normalizeToArtaxnetQueryDate("10062026")).toBe("2026/06/10");
    expect(normalizeToArtaxnetQueryDate("10/06/2026")).toBe("2026/06/10");
  });

  it("normaliza horário PM do Artaxnet", () => {
    expect(normalizeArtaxnetCheckTime("02:00 PM")).toBe("14h");
    expect(normalizeArtaxnetCheckTime("12:00 PM")).toBe("12h");
  });
});

describe("artaxnet-availability — parser fixture", () => {
  const parsed = parseArtaxnetRoomsResponse(fixture, {
    checkInIso: "2026-06-10",
    checkOutIso: "2026-06-15",
    adults: 2,
    children: 0,
    baseUrl: "https://pousada-flores-do-lazaro.artaxnet.com",
  });

  it("extrai quartos disponíveis (ignora roomsUnavailable)", () => {
    expect(parsed.roomCount).toBeGreaterThanOrEqual(2);
    expect(parsed.rooms.map((r) => r.roomName)).toEqual(expect.arrayContaining(["Standard", "Superior"]));
  });

  it("usa price como total da estadia", () => {
    const standard = parsed.rooms.find((r) => r.roomName === "Standard");
    expect(standard?.directTotal).toBe(1125);
  });

  it("monta bookingUrl com cart.id", () => {
    expect(parsed.cartId).toBeTruthy();
    expect(parsed.bookingUrl).toContain("cart_id=");
  });

  it("habilita comparação OTA quando active_otas_comparation=1", () => {
    expect(parsed.otaComparisonEnabled).toBe(true);
    expect(parsed.otas.length).toBeGreaterThanOrEqual(2);
  });
});

describe("artaxnet-availability — comparação OTA (fórmula EBE)", () => {
  it("Booking +15% sobre tarifa direta 1125", () => {
    expect(computeOtaApproximatePrice(1125, 15)).toBe(1293.75);
  });

  it("Expedia +20% sobre tarifa direta 1125", () => {
    expect(computeOtaApproximatePrice(1125, 20)).toBe(1350);
  });

  it("summaryText inclui markdown de foto e bloco OTA estimado", () => {
    const parsed = parseArtaxnetRoomsResponse(fixture, {
      checkInIso: "2026-06-10",
      checkOutIso: "2026-06-15",
      adults: 2,
      children: 0,
      baseUrl: "https://pousada-flores-do-lazaro.artaxnet.com",
    });
    const summary = buildSummaryText(parsed);
    expect(summary).toMatch(/!\[Foto/);
    expect(summary).toMatch(/aproximad/i);
    expect(summary).toMatch(/1\.293,75|1293,75/);
    expect(summary).toMatch(/1\.350,00|1350,00/);
  });
});
