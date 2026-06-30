import { describe, expect, it } from "vitest";
import {
  injectSunsetLodgingQuotePhotosIfMissing,
  lodgingAccommodationDisplayLabel,
  lodgingAccommodationGallerySearchKeys,
  matchGalleryRowToAccommodation,
} from "./sunset-lodging-gallery-photos.js";

describe("lodgingAccommodationGallerySearchKeys", () => {
  it("mapeia STANDART para chalé", () => {
    expect(lodgingAccommodationGallerySearchKeys("STANDART")).toContain("chale");
    expect(lodgingAccommodationDisplayLabel("STANDART")).toBe("Chalé");
  });

  it("mapeia LUXO COM VARANDA", () => {
    expect(
      matchGalleryRowToAccommodation(
        { name: "Suite Luxo com Varanda", description: null, cover_image_url: null, media_urls: [] },
        lodgingAccommodationGallerySearchKeys("LUXO COM VARANDA")
      )
    ).toBe(true);
  });
});

describe("injectSunsetLodgingQuotePhotosIfMissing", () => {
  const photos = [
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
  ];

  it("insere foto antes de cada linha de preço no orçamento", () => {
    const text = `*Opções*
*Chalé* — R$ 1.104,00
*Suíte Luxo* — R$ 1.564,00`;
    const result = injectSunsetLodgingQuotePhotosIfMissing(text, photos);
    expect(result).not.toBeNull();
    expect(result!.fullText.indexOf("![Chalé]")).toBeLessThan(result!.fullText.indexOf("*Chalé*"));
    expect(result!.fullText.indexOf("![Suíte Luxo]")).toBeLessThan(result!.fullText.indexOf("*Suíte Luxo*"));
  });

  it("não duplica se foto já presente", () => {
    const text = `![Chalé](https://cdn.example/chale.jpg)
*Chalé* — R$ 1.104,00`;
    expect(injectSunsetLodgingQuotePhotosIfMissing(text, [photos[0]])).toBeNull();
  });
});
