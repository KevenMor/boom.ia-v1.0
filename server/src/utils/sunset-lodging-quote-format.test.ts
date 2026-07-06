import { describe, expect, it } from "vitest";
import {
  formatSunsetLodgingQuoteForDelivery,
  reorganizeSunsetLodgingQuotePhotos,
} from "./sunset-lodging-quote-format.js";

const GALLERY_PHOTOS = [
  {
    accommodationName: "STANDART",
    displayLabel: "Chalé",
    galleryName: "Chalé",
    imageUrl: "https://cdn.example/chale.jpg",
    photoMarkdown: "![Chalé](https://cdn.example/chale.jpg)",
  },
  {
    accommodationName: "LUXO DUPLO",
    displayLabel: "Suíte Luxo",
    galleryName: "Suite Luxo Sem Varanda",
    imageUrl: "https://cdn.example/luxo.jpg",
    photoMarkdown: "![Suíte Luxo](https://cdn.example/luxo.jpg)",
  },
  {
    accommodationName: "LUXO COM VARANDA",
    displayLabel: "Suíte com Varanda",
    galleryName: "Suite Luxo com Varanda",
    imageUrl: "https://cdn.example/varanda.jpg",
    photoMarkdown: "![Suíte com Varanda](https://cdn.example/varanda.jpg)",
  },
];

const TOOL_JSON = JSON.stringify({
  available_accommodations: [
    { name: "STANDART", total_price: 552 },
    { name: "LUXO DUPLO", total_price: 782 },
    { name: "LUXO COM VARANDA", total_price: 832 },
  ],
  gallery_photos: GALLERY_PHOTOS,
});

describe("reorganizeSunsetLodgingQuotePhotos", () => {
  it("remove fotos agrupadas no topo e pareia cada uma com sua linha de preço", () => {
    const raw =
      "Segue o orçamento.\n\n" +
      "![Chalé](https://cdn.example/chale.jpg)\n" +
      "![Suíte Luxo](https://cdn.example/luxo.jpg)\n" +
      "![Suíte com Varanda](https://cdn.example/varanda.jpg)\n\n" +
      "*Resumo*\n2 pessoas\n\n" +
      "*Opções*\n" +
      "*Chalé* — R$ 552,00\n" +
      "*Suíte Luxo* — R$ 782,00\n" +
      "*Suíte com Varanda* — R$ 832,00\n\n" +
      "*Incluso no pacote*\nJantar";

    const out = reorganizeSunsetLodgingQuotePhotos(raw, GALLERY_PHOTOS);
    expect(out.indexOf("![Chalé]")).toBeLessThan(out.indexOf("*Chalé*"));
    expect(out.indexOf("*Chalé*")).toBeLessThan(out.indexOf("![Suíte Luxo]"));
    expect(out.indexOf("![Suíte Luxo]")).toBeLessThan(out.indexOf("*Suíte Luxo*"));
    expect(out.indexOf("*Suíte Luxo*")).toBeLessThan(out.indexOf("![Suíte com Varanda]"));
    expect(out.match(/!\[Chalé\]/g)?.length).toBe(1);
  });
});

describe("formatSunsetLodgingQuoteForDelivery", () => {
  it("separa intro, cada opção (foto+preço) e rodapé com MSG_SPLIT", () => {
    const assistantText =
      "Segue o orçamento solicitado.\n\n" +
      "*Resumo*\n2 pessoas · 1 pernoite\n\n" +
      "*Opções*\n" +
      "![Chalé](https://cdn.example/chale.jpg)\n" +
      "*Chalé* — R$ 552,00\n" +
      "![Suíte Luxo](https://cdn.example/luxo.jpg)\n" +
      "*Suíte Luxo* — R$ 782,00\n" +
      "![Suíte com Varanda](https://cdn.example/varanda.jpg)\n" +
      "*Suíte com Varanda* — R$ 832,00\n\n" +
      "*Incluso no pacote*\nJantar e café\n\n" +
      "*Pagamento*\nPix 40%";

    const formatted = formatSunsetLodgingQuoteForDelivery(assistantText, [TOOL_JSON]);
    const parts = formatted.split("<<MSG_SPLIT>>");

    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(parts[0]).toContain("Segue o orçamento");
    expect(parts[0]).not.toContain("![Chalé]");
    expect(parts[1]).toContain("![Chalé](https://cdn.example/chale.jpg)");
    expect(parts[1]).toContain("*Chalé* — R$ 552,00");
    expect(parts[1]).not.toContain("![Suíte Luxo]");
    expect(parts[2]).toContain("![Suíte Luxo]");
    expect(parts[2]).toContain("*Suíte Luxo* — R$ 782,00");
    expect(parts[parts.length - 1]).toContain("*Incluso no pacote*");
    expect(parts[parts.length - 1]).toContain("*Pagamento*");
  });

  it("reorganiza fotos no topo antes de dividir em bolhas", () => {
    const assistantText =
      "Segue o orçamento.\n\n" +
      "![Chalé](https://cdn.example/chale.jpg)\n" +
      "![Suíte Luxo](https://cdn.example/luxo.jpg)\n\n" +
      "*Opções*\n" +
      "*Chalé* — R$ 552,00\n" +
      "*Suíte Luxo* — R$ 782,00\n\n" +
      "*Incluso no pacote*\nJantar";

    const formatted = formatSunsetLodgingQuoteForDelivery(assistantText, [TOOL_JSON]);
    const parts = formatted.split("<<MSG_SPLIT>>");

    expect(parts[1]).toMatch(/!\[Chalé\][\s\S]*\*Chalé\* — R\$ 552,00/);
    expect(parts[2]).toMatch(/!\[Suíte Luxo\][\s\S]*\*Suíte Luxo\* — R\$ 782,00/);
    expect(parts[1]).not.toContain("![Suíte Luxo]");
  });

  it("reconstrói da tool quando preços vêm sem negrito e fotos agrupadas no topo", () => {
    const assistantText =
      "Para 11 e 12 de julho, com 2 pessoas:\n\n" +
      "![Chalé](https://cdn.example/chale.jpg)\n" +
      "![Suíte Luxo](https://cdn.example/luxo.jpg)\n" +
      "![Suíte com Varanda](https://cdn.example/varanda.jpg)\n\n" +
      "*Resumo*\n2 pessoas · 1 pernoite\n\n" +
      "*Opções*\n" +
      "Chalé — R$ 552,00\n" +
      "Suíte Luxo — R$ 782,00\n" +
      "Suíte com Varanda — R$ 832,00\n\n" +
      "*Incluso no pacote*\nJantar e café\n\n" +
      "*Pagamento*\nPix 40%";

    const formatted = formatSunsetLodgingQuoteForDelivery(assistantText, [TOOL_JSON]);
    const parts = formatted.split("<<MSG_SPLIT>>");

    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(parts[0]).not.toContain("![Chalé]");
    expect(parts[1]).toContain("![Chalé](https://cdn.example/chale.jpg)");
    expect(parts[1]).toContain("*Chalé* — R$ 552,00");
    expect(parts[2]).toContain("![Suíte Luxo]");
    expect(parts[2]).toContain("*Suíte Luxo* — R$ 782,00");
    expect(parts[3]).toContain("![Suíte com Varanda]");
    expect(parts[parts.length - 1]).toContain("*Incluso no pacote*");
  });

  it("formata rodapé com bullets e pergunta em bolha separada", () => {
    const assistantText =
      "Segue o orçamento.\n\n" +
      "*Resumo*\n2 pessoas · 2 pernoites\n\n" +
      "*Opções*\n" +
      "![Chalé](https://cdn.example/chale.jpg)\n*Chalé* — R$ 552,00\n\n" +
      "*Incluso no pacote*\nJantar; Café; Parque\n\n" +
      "Das opções, qual combina mais com vocês?";

    const formatted = formatSunsetLodgingQuoteForDelivery(assistantText, [TOOL_JSON]);
    const parts = formatted.split("<<MSG_SPLIT>>");

    const footerPart = parts.find((p) => p.includes("*Incluso no pacote*"));
    expect(footerPart).toMatch(/• Jantar/);
    const questionPart = parts.find((p) => /Das opções/i.test(p));
    expect(questionPart).toBeDefined();
    expect(footerPart).not.toMatch(/Das opções/i);
  });
});
