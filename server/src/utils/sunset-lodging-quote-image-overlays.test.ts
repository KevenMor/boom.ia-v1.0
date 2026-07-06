import { describe, expect, it, vi } from "vitest";
import { applySunsetLodgingQuoteImageOverlays } from "./sunset-lodging-quote-image-overlays.js";

vi.mock("./lodging-quote-image-overlay.js", () => ({
  isLodgingQuoteImageWithPriceBlock: (text: string) =>
    text.includes("![Chalé]") && text.includes("R$ 828,00"),
  parseLodgingQuotePriceLine: () => ({ label: "Chalé", price: "R$ 828,00" }),
  composeLodgingQuoteImageWithOverlay: vi.fn(async () => Buffer.from("jpeg")),
  uploadLodgingQuoteOverlayImage: vi.fn(
    async () => "https://cdn.example/quote-overlays/chale.jpg"
  ),
}));

describe("applySunsetLodgingQuoteImageOverlays", () => {
  it("substitui bloco foto+preço por imagem composta sem legenda duplicada", async () => {
    const input = [
      "Segue o orçamento.",
      "![Chalé](https://cdn.example/original.jpg)\n*Chalé* — R$ 828,00",
      "*Incluso no pacote*\nJantar",
    ].join("\n<<MSG_SPLIT>>\n");

    const out = await applySunsetLodgingQuoteImageOverlays(
      input,
      {} as never,
      "tenant-1"
    );

    const parts = out.split("<<MSG_SPLIT>>");
    expect(parts[0]).toContain("Segue o orçamento");
    expect(parts[1].trim()).toBe("![Chalé](https://cdn.example/quote-overlays/chale.jpg)");
    expect(parts[1]).not.toContain("R$ 828,00");
    expect(parts[2]).toContain("*Incluso no pacote*");
  });
});
