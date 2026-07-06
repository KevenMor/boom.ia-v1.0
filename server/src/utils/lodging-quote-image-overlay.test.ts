import { describe, expect, it } from "vitest";
import {
  buildLodgingQuoteOverlaySvg,
  isLodgingQuoteImageWithPriceBlock,
  parseLodgingQuotePriceLine,
} from "./lodging-quote-image-overlay.js";

describe("lodging-quote-image-overlay", () => {
  it("parseLodgingQuotePriceLine extrai nome e valor", () => {
    expect(parseLodgingQuotePriceLine("*Chalé* — R$ 828,00")).toEqual({
      label: "Chalé",
      price: "R$ 828,00",
    });
    expect(parseLodgingQuotePriceLine("Suíte Luxo — R$ 1.173,00")).toEqual({
      label: "Suíte Luxo",
      price: "R$ 1.173,00",
    });
  });

  it("isLodgingQuoteImageWithPriceBlock detecta bloco foto+preço", () => {
    const block =
      "![Chalé](https://cdn.example/chale.jpg)\n*Chalé* — R$ 828,00";
    expect(isLodgingQuoteImageWithPriceBlock(block)).toBe(true);
    expect(isLodgingQuoteImageWithPriceBlock("![Chalé](https://x.jpg)")).toBe(false);
  });

  it("buildLodgingQuoteOverlaySvg inclui label e preço escapados", () => {
    const svg = buildLodgingQuoteOverlaySvg(800, 600, "Suíte & Varanda", "R$ 1.248,00");
    expect(svg).toContain("Suíte &amp; Varanda");
    expect(svg).toContain("R$ 1.248,00");
    expect(svg).toContain('width="800"');
  });
});
