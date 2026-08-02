import { describe, expect, it } from "vitest";
import {
  formatInventoryQuoteForDelivery,
  inventoryQuoteLooksHallucinated,
  parseInventoryVehiclesFromToolResults,
  shouldForceInventoryAfterNameCapture,
} from "./inventory-quote-format.js";

const MAVERICK_TOOL = JSON.stringify({
  _hint: "ESTOQUE ATUAL (1 veículo(s)).",
  total: 1,
  vehicles: [
    {
      id: "cfe51715-f6b9-4e9f-961c-e33a38a9a83f",
      km: 29389,
      ano: 2024,
      cor: "Preto",
      marca: "FORD",
      preco: 180000,
      preco_formatado: "R$ 180.000,00",
      cambio: "Automático",
      modelo: "MAVERICK 2.5 HYBRID LARIAT e-CVT",
      nome_completo: "FORD MAVERICK 2.5 HYBRID LARIAT e-CVT",
    },
  ],
});

const HALLUCINATED = `Muito prazer, Antonio Carlos!

A Ford Maverick 2024 é uma picape fantástica, muito procurada. Temos uma unidade aqui na loja que está impecável.

Ford Maverick Lariat 2.0 EcoBoost 2024
Preço: R$ 229.900,00
Quilometragem: 12.500 km
Cor: Cinza Moscou
Câmbio: Automático

Quer que eu te mande umas fotos pra você ver como ela está?`;

describe("parseInventoryVehiclesFromToolResults", () => {
  it("extrai veículos do JSON da tool", () => {
    const vehicles = parseInventoryVehiclesFromToolResults([MAVERICK_TOOL]);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].preco).toBe(180000);
    expect(vehicles[0].km).toBe(29389);
    expect(vehicles[0].modelo).toContain("HYBRID");
  });
});

describe("inventoryQuoteLooksHallucinated", () => {
  it("detecta preço e km inventados (caso Maverick)", () => {
    const vehicles = parseInventoryVehiclesFromToolResults([MAVERICK_TOOL]);
    expect(inventoryQuoteLooksHallucinated(HALLUCINATED, vehicles)).toBe(true);
  });

  it("não marca como alucinação quando os fatos batem", () => {
    const vehicles = parseInventoryVehiclesFromToolResults([MAVERICK_TOOL]);
    const ok = `FORD MAVERICK 2.5 HYBRID LARIAT e-CVT
Preço: R$ 180.000,00
Quilometragem: 29.389 km
Cor: Preto
Câmbio: Automático`;
    expect(inventoryQuoteLooksHallucinated(ok, vehicles)).toBe(false);
  });
});

describe("formatInventoryQuoteForDelivery", () => {
  it("substitui EcoBoost/preço/km/cor inventados pelos dados reais da tool", () => {
    const out = formatInventoryQuoteForDelivery(HALLUCINATED, [MAVERICK_TOOL]);
    expect(out).toContain("180.000");
    expect(out).toContain("29.389");
    expect(out).toContain("Preto");
    expect(out).toMatch(/HYBRID/i);
    expect(out).not.toContain("229.900");
    expect(out).not.toContain("12.500");
    expect(out).not.toContain("Cinza Moscou");
    expect(out).not.toMatch(/EcoBoost/i);
    expect(out).toContain("Muito prazer, Antonio Carlos!");
    expect(out).toMatch(/fotos/i);
  });

  it("corrige km errado em follow-up com tool", () => {
    const reply =
      "Antonio Carlos, o valor que te passei é o da unidade Lariat 2024 que temos aqui na loja, com 12.500 km.";
    const out = formatInventoryQuoteForDelivery(reply, [MAVERICK_TOOL]);
    expect(out).toContain("29.389");
    expect(out).not.toContain("12.500");
  });

  it("não altera texto sem specs de estoque", () => {
    const text = "Muito prazer! Como posso te chamar?";
    expect(formatInventoryQuoteForDelivery(text, [MAVERICK_TOOL])).toBe(text);
  });
});

describe("shouldForceInventoryAfterNameCapture", () => {
  it("detecta 2º turno só com nome após citação de Maverick", () => {
    const result = shouldForceInventoryAfterNameCapture([
      { role: "user", content: "Olá! Vi o anúncio da Ford Maverick 2024 e queria mais informações." },
      { role: "assistant", content: "Oi! Sou a Ana Júlia. Como posso te chamar?" },
      { role: "user", content: "Antonio Carlos" },
    ]);
    expect(result.force).toBe(true);
    expect(result.marca).toMatch(/Ford/i);
    expect(result.modelo?.toLowerCase()).toContain("maverick");
    expect(result.ano).toBe(2024);
  });

  it("não força quando a última msg não é só nome", () => {
    const result = shouldForceInventoryAfterNameCapture([
      { role: "user", content: "Quero a Ford Maverick" },
      { role: "user", content: "Quanto custa?" },
    ]);
    expect(result.force).toBe(false);
  });
});
