import { describe, it, expect } from "vitest";
import { formatLodgingConsultaForLlm } from "./lodging-consulta-summary.js";

/** Payload real (Sunset Thermas — Dia dos Namorados, 2 noites, 2 adultos). */
const SUNSET_THREE_OPTIONS = {
  status: "success",
  check_in: "2026-06-12",
  check_out: "2026-06-14",
  nights: 2,
  guests_in_family: 2,
  guests_for_pricing: 2,
  kids_under_12: [],
  available_accommodations: [
    {
      id: "luxo-varanda",
      name: "LUXO COM VARANDA",
      guests: 2,
      nights: 2,
      price_per_night: 832,
      total_price: 1664,
      notes: "Não válido para datas especiais/eventos",
    },
    {
      id: "luxo-duplo",
      name: "LUXO DUPLO",
      guests: 2,
      nights: 2,
      price_per_night: 782,
      total_price: 1564,
      notes: "Não válido para datas especiais/eventos",
    },
    {
      id: "standart",
      name: "STANDART",
      guests: 2,
      nights: 2,
      price_per_night: 552,
      total_price: 1104,
      notes: "Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos",
    },
  ],
  message:
    "Encontramos 3 opções de hospedagem para 2 pessoas, de 12/06/2026 a 14/06/2026 (2 noites).",
};

describe("formatLodgingConsultaForLlm", () => {
  it("lista as 3 acomodações com preços (não trunca como slice(0,300))", () => {
    const summary = formatLodgingConsultaForLlm(SUNSET_THREE_OPTIONS);
    expect(summary).not.toBeNull();
    expect(summary!.length).toBeGreaterThan(300);

    expect(summary).toContain("LUXO COM VARANDA");
    expect(summary).toContain("LUXO DUPLO");
    expect(summary).toContain("STANDART");

    expect(summary).toMatch(/1\.664,00|1664/);
    expect(summary).toMatch(/1\.564,00|1564/);
    expect(summary).toMatch(/1\.104,00|1104/);

    expect(summary).toContain("3 opção");
    expect(summary).toContain("TODAS");
    expect(summary).toContain("12/06/2026");
    expect(summary).toContain("14/06/2026");
  });

  it("retorna null para objetos que não são consulta de hospedagem", () => {
    expect(formatLodgingConsultaForLlm({ vehicles: [] })).toBeNull();
    expect(formatLodgingConsultaForLlm({ error: "falha" })).toBeNull();
  });

  it("trata park_closed sem citar tarifas e oferece janela alternativa", () => {
    const summary = formatLodgingConsultaForLlm({
      status: "park_closed",
      message: "Parque fechado às segundas.",
      suggestions: ["Hospedagem com parque aberto: check-in 18/05/2026 → check-out 19/05/2026 (1 noite)"],
      nearest_open_window: { check_in: "2026-05-18", check_out: "2026-05-19", nights: 1 },
    });
    expect(summary).toMatch(/parque fechado/i);
    expect(summary).toContain("PROIBIDO citar valores");
    expect(summary).toContain("JANELA ALTERNATIVA");
    expect(summary).toContain("2026-05-18");
    expect(summary).toMatch(/OFEREÇA|orçamento/i);
  });

  it("ordena acomodações do menor para o maior total_price", () => {
    const summary = formatLodgingConsultaForLlm(SUNSET_THREE_OPTIONS)!;
    const standartIdx = summary.indexOf("STANDART");
    const luxoDuploIdx = summary.indexOf("LUXO DUPLO");
    const luxoVarandaIdx = summary.indexOf("LUXO COM VARANDA");
    expect(standartIdx).toBeLessThan(luxoDuploIdx);
    expect(luxoDuploIdx).toBeLessThan(luxoVarandaIdx);
  });

  it("inclui instruções de foto por acomodação quando gallery_photos está presente", () => {
    const summary = formatLodgingConsultaForLlm({
      ...SUNSET_THREE_OPTIONS,
      gallery_photos: [
        {
          accommodationName: "STANDART",
          displayLabel: "Chalé",
          galleryName: "Chalé",
          imageUrl: "https://cdn.example/chale.jpg",
          photoMarkdown: "![Chalé](https://cdn.example/chale.jpg)",
        },
      ],
    });
    expect(summary).toMatch(/FOTOS NO ORÇAMENTO/i);
    expect(summary).toContain("![Chalé](https://cdn.example/chale.jpg)");
    expect(summary).toMatch(/foto.*linha/i);
  });
});
